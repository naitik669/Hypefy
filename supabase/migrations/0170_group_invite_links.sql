-- A link that lets someone into a group.
--
-- Holding the link is enough by default, which is what people expect and
-- what makes it worth having. An admin can turn on approval per group, and
-- then the link only asks.
--
-- Pending joins are NOT membership rows with a flag. conversation_members
-- already has request_accepted, and reusing it here would have been the
-- obvious thing and a hole: is_conv_member does not look at that column, so
-- somebody waiting to be let in would have passed every RLS policy in the
-- schema and read the chat while they waited. A request is its own table,
-- and until it is approved there is no membership anywhere.

create table if not exists public.conversation_invites (
  -- One live link per group. Regenerating replaces the code, which is also
  -- how a link is revoked: whatever was pasted elsewhere stops working.
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  code text not null unique,
  requires_approval boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_join_requests (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_invites enable row level security;
alter table public.conversation_join_requests enable row level security;

-- Members see their group's link, to copy it. Nobody looks a code up this
-- way — join_by_invite does that with the definer's rights, because a
-- stranger holding a link is exactly who cannot read this table.
drop policy if exists "invites: members read" on public.conversation_invites;
create policy "invites: members read" on public.conversation_invites
  for select using (public.is_conv_member(conversation_id));

-- Members see who is waiting; the person waiting sees their own request.
drop policy if exists "join requests: members and self read" on public.conversation_join_requests;
create policy "join requests: members and self read" on public.conversation_join_requests
  for select using (
    public.is_conv_member(conversation_id) or user_id = (select auth.uid())
  );

-- Changing their own mind is allowed; everything else goes through a
-- function, which is where admin and membership are checked.
drop policy if exists "join requests: own withdraw" on public.conversation_join_requests;
create policy "join requests: own withdraw" on public.conversation_join_requests
  for delete using (user_id = (select auth.uid()));

revoke all on public.conversation_invites from anon, authenticated;
revoke all on public.conversation_join_requests from anon, authenticated;
grant select on public.conversation_invites to authenticated;
grant select, delete on public.conversation_join_requests to authenticated;

/** Is this person an admin of this group? */
create or replace function public.is_conv_admin(p_conversation_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
     where conversation_id = p_conversation_id
       and user_id = auth.uid()
       and role = 'admin'
  )
$$;

revoke all on function public.is_conv_admin(uuid) from public, anon;
grant execute on function public.is_conv_admin(uuid) to authenticated;

/**
 * Make a group's link, or make a new one.
 *
 * Admins only, groups only. Calling it again replaces the code, which is
 * how you revoke a link that went somewhere you did not mean.
 */
create or replace function public.set_group_invite(
  p_conversation_id uuid,
  p_requires_approval boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_code text;
begin
  if not public.is_conv_admin(p_conversation_id) then
    raise exception 'Admins only';
  end if;
  if not exists (
    select 1 from public.conversations
     where id = p_conversation_id and type = 'group'
  ) then
    raise exception 'Groups only';
  end if;

  -- 24 hex characters: not worth guessing at, and nothing in it to read.
  v_code := encode(gen_random_bytes(12), 'hex');

  insert into public.conversation_invites
    (conversation_id, code, requires_approval, created_by)
  values (p_conversation_id, v_code, coalesce(p_requires_approval, false), auth.uid())
  on conflict (conversation_id) do update
    set code = excluded.code,
        requires_approval = excluded.requires_approval,
        created_by = excluded.created_by,
        created_at = now();

  return v_code;
end $$;

revoke all on function public.set_group_invite(uuid, boolean) from public, anon;
grant execute on function public.set_group_invite(uuid, boolean) to authenticated;

/** Turn approval on or off without changing the link people already have. */
create or replace function public.set_group_invite_approval(
  p_conversation_id uuid,
  p_requires_approval boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_conv_admin(p_conversation_id) then
    raise exception 'Admins only';
  end if;
  update public.conversation_invites
     set requires_approval = coalesce(p_requires_approval, false)
   where conversation_id = p_conversation_id;
end $$;

revoke all on function public.set_group_invite_approval(uuid, boolean) from public, anon;
grant execute on function public.set_group_invite_approval(uuid, boolean) to authenticated;

/** Put the link away. Whatever was pasted elsewhere stops working. */
create or replace function public.clear_group_invite(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_conv_admin(p_conversation_id) then
    raise exception 'Admins only';
  end if;
  delete from public.conversation_invites where conversation_id = p_conversation_id;
end $$;

revoke all on function public.clear_group_invite(uuid) from public, anon;
grant execute on function public.clear_group_invite(uuid) to authenticated;

/**
 * Walk in, or ask to.
 *
 * Returns 'joined', 'pending', or 'already' — the caller needs to know
 * which, because two of them open the chat and one does not.
 *
 * Blocks are honoured in both directions. A link is a way around not
 * knowing somebody's handle; it is not a way around having been blocked
 * by one of them, and a group where two people have blocked each other is
 * a thing neither of them asked for.
 */
create or replace function public.join_by_invite(p_code text)
returns table (conversation_id uuid, outcome text)
language plpgsql
security definer
set search_path = public
as $$
declare v_conv uuid; v_needs boolean; v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Sign in first';
  end if;

  select i.conversation_id, i.requires_approval into v_conv, v_needs
    from public.conversation_invites i
   where i.code = btrim(coalesce(p_code, ''));

  if v_conv is null then
    raise exception 'That link does not work any more';
  end if;

  if exists (
    select 1 from public.conversation_members where conversation_id = v_conv and user_id = v_me
  ) then
    return query select v_conv, 'already'::text;
    return;
  end if;

  if exists (
    select 1
      from public.conversation_members cm
      join public.blocked_users b
        on (b.blocker_id = cm.user_id and b.blocked_id = v_me)
        or (b.blocker_id = v_me and b.blocked_id = cm.user_id)
     where cm.conversation_id = v_conv
  ) then
    raise exception 'That link does not work any more';
  end if;

  if v_needs then
    insert into public.conversation_join_requests (conversation_id, user_id)
    values (v_conv, v_me)
    on conflict (conversation_id, user_id) do nothing;
    return query select v_conv, 'pending'::text;
    return;
  end if;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conv, v_me, 'member')
  on conflict do nothing;
  return query select v_conv, 'joined'::text;
end $$;

revoke all on function public.join_by_invite(text) from public, anon;
grant execute on function public.join_by_invite(text) to authenticated;

/** Let somebody in, or turn them away. Admins only. */
create or replace function public.decide_join_request(
  p_conversation_id uuid,
  p_user_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_conv_admin(p_conversation_id) then
    raise exception 'Admins only';
  end if;

  delete from public.conversation_join_requests
   where conversation_id = p_conversation_id and user_id = p_user_id;

  if p_accept then
    insert into public.conversation_members (conversation_id, user_id, role)
    values (p_conversation_id, p_user_id, 'member')
    on conflict do nothing;
  end if;
end $$;

revoke all on function public.decide_join_request(uuid, uuid, boolean) from public, anon;
grant execute on function public.decide_join_request(uuid, uuid, boolean) to authenticated;
