-- Group calls: a mesh WebRTC call tied to a group conversation. Kept entirely
-- separate from the 1:1 call_sessions flow so DM calling is untouched. Writes go
-- through SECURITY DEFINER RPCs (membership-checked); RLS is read-only for members.

create table if not exists public.group_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  started_by uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.group_call_participants (
  call_id uuid not null references public.group_calls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (call_id, user_id)
);

create index if not exists group_calls_conv_active_idx
  on public.group_calls (conversation_id) where ended_at is null;

alter table public.group_calls enable row level security;
alter table public.group_call_participants enable row level security;

drop policy if exists "group_calls: member read" on public.group_calls;
create policy "group_calls: member read" on public.group_calls
  for select using (public.is_conv_member(conversation_id));

drop policy if exists "group_call_participants: member read" on public.group_call_participants;
create policy "group_call_participants: member read" on public.group_call_participants
  for select using (
    exists (select 1 from public.group_calls gc
            where gc.id = call_id and public.is_conv_member(gc.conversation_id))
  );

-- Start (or rejoin) the active group call for a conversation; adds the caller as
-- a live participant and returns the call id.
create or replace function public.start_group_call(p_conversation_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_me uuid := (select auth.uid()); v_call uuid;
begin
  if v_me is null or not public.is_conv_member(p_conversation_id) then
    raise exception 'Not a member';
  end if;

  select id into v_call from public.group_calls
    where conversation_id = p_conversation_id and ended_at is null
    order by started_at desc limit 1;

  if v_call is null then
    insert into public.group_calls (conversation_id, started_by)
      values (p_conversation_id, v_me) returning id into v_call;
  end if;

  insert into public.group_call_participants (call_id, user_id)
    values (v_call, v_me)
    on conflict (call_id, user_id) do update set joined_at = now(), left_at = null;

  return v_call;
end;
$$;

-- Join an existing group call (membership enforced via the call's conversation).
create or replace function public.join_group_call(p_call_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null or not exists (
    select 1 from public.group_calls gc
    where gc.id = p_call_id and gc.ended_at is null and public.is_conv_member(gc.conversation_id)
  ) then
    raise exception 'Cannot join';
  end if;
  insert into public.group_call_participants (call_id, user_id)
    values (p_call_id, v_me)
    on conflict (call_id, user_id) do update set joined_at = now(), left_at = null;
end;
$$;

-- Leave a group call; ends the call when the last live participant leaves.
create or replace function public.leave_group_call(p_call_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_me uuid := (select auth.uid()); v_remaining int;
begin
  update public.group_call_participants set left_at = now()
    where call_id = p_call_id and user_id = v_me and left_at is null;

  select count(*) into v_remaining from public.group_call_participants
    where call_id = p_call_id and left_at is null;

  if v_remaining = 0 then
    update public.group_calls set ended_at = now() where id = p_call_id and ended_at is null;
  end if;
end;
$$;
