-- Shows several people build together.
--
-- A collab is one cover with several people posting behind it. Each
-- Show still belongs to whoever posted it — it is their row, their
-- media, their hype, their takedown — and `collab_id` says which
-- shared reel it also appears in. That is deliberately the weaker of
-- the two possible shapes: a collab that *owned* its Shows would mean
-- leaving one takes your own posts with it, or does not, and both
-- answers are wrong.
--
-- Membership is joined, not assigned. Being added to something without
-- saying yes puts a cover on your ring that you did not ask for and
-- lets you be listed as a contributor to whatever the others post.
-- `joined_at` null is an invitation; set is a member.

create table if not exists public.show_collabs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (btrim(title) <> '' and char_length(title) <= 60),
  created_at timestamptz not null default now(),
  -- Moderation reaches a collab the way it reaches everything else.
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null,
  removal_reason text
);

create index if not exists show_collabs_owner_idx on public.show_collabs (owner_id);

create table if not exists public.show_collab_members (
  collab_id uuid not null references public.show_collabs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  /** Null while it is still an invitation. */
  joined_at timestamptz,
  primary key (collab_id, user_id)
);

create index if not exists show_collab_members_user_idx on public.show_collab_members (user_id);

alter table public.shows
  add column if not exists collab_id uuid references public.show_collabs(id) on delete set null;

create index if not exists shows_collab_idx on public.shows (collab_id) where collab_id is not null;

comment on column public.shows.collab_id is
  'The shared reel this Show also appears in. The Show still belongs to its own author.';

-- 0150 revoked column-wide writes; a new column is unwritable until named.
grant insert (user_id, media_url, caption, track, linked_post_id, mentions, layers, audience, collab_id)
  on public.shows to authenticated;
grant update (is_showcase, layers, audience) on public.shows to authenticated;

alter table public.show_collabs enable row level security;
alter table public.show_collab_members enable row level security;

-- ---------------------------------------------------------------- --
-- Who is in it
-- ---------------------------------------------------------------- --

/**
 * Is this person a joined member of this collab?
 *
 * SECURITY DEFINER and used by the policies below, so the policies do
 * not have to read show_collab_members through its own policy and
 * recurse. The same reason can_see_show exists: one definition, asked
 * from several places.
 */
create or replace function public.in_show_collab(p_collab uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.show_collab_members m
      join public.show_collabs c on c.id = m.collab_id
     where m.collab_id = p_collab
       and m.user_id = p_user
       and m.joined_at is not null
       and c.removed_at is null
  );
$$;

revoke all on function public.in_show_collab(uuid, uuid) from public, anon;
grant execute on function public.in_show_collab(uuid, uuid) to authenticated;

drop policy if exists "collabs: the ones you are in" on public.show_collabs;
create policy "collabs: the ones you are in" on public.show_collabs
  for select using (
    removed_at is null
    and (
      owner_id = (select auth.uid())
      -- An invitation has to be readable, or there is nothing to accept.
      or exists (select 1 from public.show_collab_members m
                  where m.collab_id = show_collabs.id and m.user_id = (select auth.uid()))
    )
  );

drop policy if exists "collab members: visible inside the collab" on public.show_collab_members;
create policy "collab members: visible inside the collab" on public.show_collab_members
  for select using (
    user_id = (select auth.uid())
    or public.in_show_collab(collab_id, (select auth.uid()))
    or (select auth.uid()) = (select c.owner_id from public.show_collabs c where c.id = show_collab_members.collab_id)
  );

revoke all on public.show_collabs from anon, authenticated;
revoke all on public.show_collab_members from anon, authenticated;
grant select on public.show_collabs to authenticated;
grant select on public.show_collab_members to authenticated;

-- ---------------------------------------------------------------- --
-- Seeing one
-- ---------------------------------------------------------------- --

/**
 * The whole visibility rule, with membership added.
 *
 * Membership stands in for the privacy and audience clauses: joining a
 * collab is a more explicit relationship than following somebody, so a
 * member sees what is posted into it even if the author is private or
 * posted to Hypers. It does **not** stand in for the three that are
 * not about reach:
 *
 *   * takedown — moderation is not negotiable by joining something;
 *   * expiry — a collab Show is still a Show and still has its day;
 *   * hidden-from — "not this person" is the author naming somebody,
 *     and it has to beat every other way in, or it means nothing.
 */
create or replace function public.can_see_show(p_show uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shows s
     where s.id = p_show
       and (s.removed_at is null or s.user_id = (select auth.uid()) or public.is_admin())
       and (
         s.expires_at > now()
         or s.user_id = (select auth.uid())
         or public.is_admin()
         or exists (select 1 from public.showcase_items si join public.showcases sc on sc.id = si.showcase_id
                     where si.show_id = s.id and si.removed_at is null and sc.removed_at is null)
       )
       and (
         s.user_id = (select auth.uid())
         -- In the collab it was posted into.
         or (s.collab_id is not null
             and public.in_show_collab(s.collab_id, (select auth.uid())))
         or (
           -- Otherwise the ordinary way in: able to see them, and in
           -- the room they posted to.
           (
             not exists (select 1 from public.profiles p where p.id = s.user_id and coalesce(p.is_private, false))
             or exists (select 1 from public.follows f where f.following_id = s.user_id and f.follower_id = (select auth.uid()))
           )
           and (
             s.audience = 'everyone'
             or exists (select 1 from public.close_friends c
                         where c.user_id = s.user_id and c.friend_id = (select auth.uid()))
           )
         )
       )
       and (
         s.user_id = (select auth.uid())
         or not exists (select 1 from public.show_hidden_from h
                         where h.show_id = s.id and h.user_id = (select auth.uid()))
       )
  );
$$;

revoke all on function public.can_see_show(uuid) from public;
grant execute on function public.can_see_show(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- --
-- Making one, and being in one
-- ---------------------------------------------------------------- --

/** How many people one collab holds, the owner included. */
create or replace function public.show_collab_cap()
returns int language sql immutable set search_path = public as $ select 20 $;

grant execute on function public.show_collab_cap() to authenticated;

create or replace function public.create_show_collab(p_title text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '[\s\u0000-\u001f\u007f]+', ' ', 'g'));
  v_id uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if v_title = '' then raise exception 'Give it a name'; end if;
  if char_length(v_title) > 60 then raise exception 'That name is too long'; end if;

  insert into public.show_collabs (owner_id, title) values (v_me, v_title) returning id into v_id;
  -- The owner is a member from the start, and has nothing to accept.
  insert into public.show_collab_members (collab_id, user_id, invited_by, joined_at)
  values (v_id, v_me, v_me, now());

  return v_id;
end $$;

revoke all on function public.create_show_collab(text) from public, anon;
grant execute on function public.create_show_collab(text) to authenticated;

create or replace function public.invite_to_show_collab(p_collab uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
  v_title text;
  v_count int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  select c.title into v_title from public.show_collabs c
   where c.id = p_collab and c.removed_at is null;
  if v_title is null then raise exception 'No such Show'; end if;

  -- Anybody already in it can bring somebody in. It is a shared thing;
  -- making the owner the only door turns it into their Show with
  -- guests, which is the thing it is not.
  if not public.in_show_collab(p_collab, v_me) then
    raise exception 'You are not in this Show';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'No such person';
  end if;
  if p_user = v_me then return; end if;

  -- Blocked either way is not an invitation.
  if p_user in (select public.blocked_either_way()) then
    raise exception 'Cannot invite them';
  end if;

  select count(*) into v_count from public.show_collab_members where collab_id = p_collab;
  if v_count >= public.show_collab_cap() then
    raise exception 'That Show is full';
  end if;

  insert into public.show_collab_members (collab_id, user_id, invited_by)
  values (p_collab, p_user, v_me)
  on conflict (collab_id, user_id) do nothing;

  -- Only tell them if this invitation is new. A second invite from a
  -- second member should not be a second notification.
  if found then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (p_user, v_me, 'show_collab_invite', 'show_collab', p_collab, 'invited you to a shared Show')
    on conflict do nothing;
  end if;
end $$;

revoke all on function public.invite_to_show_collab(uuid, uuid) from public, anon;
grant execute on function public.invite_to_show_collab(uuid, uuid) to authenticated;

create or replace function public.join_show_collab(p_collab uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  update public.show_collab_members
     set joined_at = coalesce(joined_at, now())
   where collab_id = p_collab
     and user_id = v_me
     and exists (select 1 from public.show_collabs c where c.id = p_collab and c.removed_at is null);

  if not found then raise exception 'You were not invited to this Show'; end if;
end $$;

revoke all on function public.join_show_collab(uuid) from public, anon;
grant execute on function public.join_show_collab(uuid) to authenticated;

/**
 * Leaving, which does not take your Shows with it.
 *
 * They were always yours: your row, your media, your hype. What leaving
 * ends is the cover they also appeared under. The owner leaving ends
 * the collab for everybody, because a shared Show with nobody to own it
 * is a thing nobody can moderate or close.
 */
create or replace function public.leave_show_collab(p_collab uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
  v_owner uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  select owner_id into v_owner from public.show_collabs where id = p_collab and removed_at is null;
  if v_owner is null then raise exception 'No such Show'; end if;

  if v_owner = v_me then
    update public.show_collabs set removed_at = now(), removed_by = v_me,
           removal_reason = 'closed by its owner'
     where id = p_collab;
    update public.shows set collab_id = null where collab_id = p_collab;
    return;
  end if;

  delete from public.show_collab_members where collab_id = p_collab and user_id = v_me;
  update public.shows set collab_id = null where collab_id = p_collab and user_id = v_me;
end $$;

revoke all on function public.leave_show_collab(uuid) from public, anon;
grant execute on function public.leave_show_collab(uuid) to authenticated;

-- ---------------------------------------------------------------- --
-- Posting into one
-- ---------------------------------------------------------------- --

/**
 * A Show may only name a collab its author has joined.
 *
 * collab_id is a client-written column, so without this anybody could
 * post into anybody's shared Show by guessing an id — and a collab is
 * exactly a list of people who can see each other's posts. A trigger
 * rather than a policy clause: the insert policy is about owning the
 * row, and this is about the one column.
 */
create or replace function public.tg_shows_collab_is_yours()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.collab_id is null then return new; end if;
  if not public.in_show_collab(new.collab_id, new.user_id) then
    raise exception 'You are not in that shared Show';
  end if;
  return new;
end $$;

revoke execute on function public.tg_shows_collab_is_yours() from public, anon, authenticated;

drop trigger if exists on_shows_collab_is_yours on public.shows;
create trigger on_shows_collab_is_yours before insert or update of collab_id on public.shows
  for each row execute function public.tg_shows_collab_is_yours();
