-- Private-account privacy was trivially bypassable: is_private only gated content
-- via client-side isLocked, while the follows INSERT policy let anyone follow
-- instantly — and following a private account immediately unlocked it. Fix with a
-- real follow-request flow, and block all direct client follow inserts so the
-- only way to follow is via follow_user (which enforces privacy).

create table if not exists public.follow_requests (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requester_id, target_id)
);
create index if not exists follow_requests_target_idx on public.follow_requests(target_id);
alter table public.follow_requests enable row level security;
-- Readable by either party; writes happen only through SECURITY DEFINER RPCs.
drop policy if exists follow_requests_read on public.follow_requests;
create policy follow_requests_read on public.follow_requests
  for select using ((select auth.uid()) in (requester_id, target_id));

-- follow_user now branches on the target's privacy: private → pending request.
create or replace function public.follow_user(p_target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid()); v_inserted boolean; v_private boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_target = v_uid then raise exception 'Cannot follow yourself'; end if;
  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = v_uid and b.blocked_id = p_target)
       or (b.blocker_id = p_target and b.blocked_id = v_uid)
  ) then raise exception 'Blocked'; end if;

  if exists (select 1 from public.follows where follower_id = v_uid and following_id = p_target) then
    return 'following';
  end if;

  select is_private into v_private from public.profiles where id = p_target;

  if coalesce(v_private, false) then
    insert into public.follow_requests (requester_id, target_id)
    values (v_uid, p_target)
    on conflict (requester_id, target_id) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (p_target, v_uid, 'follow_request', 'profile', v_uid, 'requested to follow you');
    end if;
    return 'requested';
  end if;

  insert into public.follows (follower_id, following_id)
  values (v_uid, p_target)
  on conflict (follower_id, following_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (p_target, v_uid, 'follow', 'profile', p_target, 'started following you');
  end if;
  return 'following';
end $$;

-- unfollow also cancels any pending request and clears both notif types.
create or replace function public.unfollow_user(p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  delete from public.follows where follower_id = v_uid and following_id = p_target;
  delete from public.follow_requests where requester_id = v_uid and target_id = p_target;
  delete from public.notifications
    where user_id = p_target and actor_id = v_uid and type in ('follow', 'follow_request');
end $$;

-- Target approves: create the follow, drop the request, ping the requester.
create or replace function public.approve_follow_request(p_requester uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.follow_requests where requester_id = p_requester and target_id = v_uid) then
    raise exception 'No such request';
  end if;
  insert into public.follows (follower_id, following_id)
  values (p_requester, v_uid)
  on conflict (follower_id, following_id) do nothing;
  delete from public.follow_requests where requester_id = p_requester and target_id = v_uid;
  delete from public.notifications where user_id = v_uid and actor_id = p_requester and type = 'follow_request';
  insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
  values (p_requester, v_uid, 'follow_accepted', 'profile', v_uid, 'accepted your follow request');
end $$;

create or replace function public.deny_follow_request(p_requester uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  delete from public.follow_requests where requester_id = p_requester and target_id = v_uid;
  delete from public.notifications where user_id = v_uid and actor_id = p_requester and type = 'follow_request';
end $$;

revoke all on function public.approve_follow_request(uuid) from anon;
revoke all on function public.deny_follow_request(uuid) from anon;
grant execute on function public.approve_follow_request(uuid) to authenticated;
grant execute on function public.deny_follow_request(uuid) to authenticated;

-- No more direct client follow inserts — the only path is follow_user (which
-- enforces the private-account gate). Definer RPCs bypass RLS, so they still work.
drop policy if exists "follows: own insert" on public.follows;
drop policy if exists "follows: no direct insert" on public.follows;
create policy "follows: no direct insert" on public.follows for insert with check (false);

-- Fold the new follow notification types into the "follows" preference bucket.
create or replace function public.filter_notification_prefs()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prefs jsonb;
  v_key text;
begin
  v_key := case
    when new.type like 'hype_%' or new.type = 'repost' then 'hypes'
    when new.type like 'comment_%' then 'comments'
    when new.type in ('follow', 'follow_request', 'follow_accepted') then 'follows'
    when new.type like 'mention_%' then 'mentions'
    when new.type in ('new_message', 'dm_post_shared') then 'messages'
    else null
  end;
  if v_key is null then return new; end if;

  select notif_prefs into v_prefs from public.profiles where id = new.user_id;
  if v_prefs is not null and v_prefs ->> v_key = 'false' then
    return null;
  end if;
  return new;
end $$;
