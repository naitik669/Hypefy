-- Close the notification-forgery hole. The notifications INSERT policy was
-- `with check (auth.uid() is not null)` — any authed user could insert ANY
-- notification (fake "X followed you", fake hype) for anyone, because follows
-- and note-reaction notifications were written directly from the client.
--
-- Fix: move those two client-side notification writes into SECURITY DEFINER
-- RPCs (which run as postgres and bypass RLS, like every other notification
-- source here), then forbid all direct client inserts into notifications. The
-- existing trigger/RPC notification sources are unaffected (same definer path).

-- ── follow / unfollow (was duplicated across 5 client components) ────────────
create or replace function public.follow_user(p_target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid()); v_inserted boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_target = v_uid then raise exception 'Cannot follow yourself'; end if;
  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = v_uid and b.blocked_id = p_target)
       or (b.blocker_id = p_target and b.blocked_id = v_uid)
  ) then raise exception 'Blocked'; end if;

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

create or replace function public.unfollow_user(p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  delete from public.follows where follower_id = v_uid and following_id = p_target;
  delete from public.notifications
    where user_id = p_target and actor_id = v_uid and type = 'follow';
end $$;

-- ── note reactions (was a direct client notifications insert) ────────────────
create or replace function public.react_to_note(p_owner uuid, p_emoji text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid()); v_created timestamptz; v_had boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if char_length(coalesce(p_emoji, '')) = 0 then raise exception 'No emoji'; end if;
  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = v_uid and b.blocked_id = p_owner)
       or (b.blocker_id = p_owner and b.blocked_id = v_uid)
  ) then raise exception 'Blocked'; end if;

  select created_at into v_created from public.notes where user_id = p_owner and expires_at > now();
  if v_created is null then raise exception 'No active note'; end if;

  select exists (
    select 1 from public.note_reactions where note_owner_id = p_owner and reactor_id = v_uid
  ) into v_had;

  insert into public.note_reactions (note_owner_id, reactor_id, emoji, note_created_at)
  values (p_owner, v_uid, p_emoji, v_created)
  on conflict (note_owner_id, reactor_id)
  do update set emoji = excluded.emoji, note_created_at = excluded.note_created_at;

  -- Ping the owner only on a fresh reaction, not an emoji swap.
  if not v_had then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (p_owner, v_uid, 'note_reaction', 'profile', p_owner, 'reacted ' || p_emoji || ' to your status');
  end if;
end $$;

create or replace function public.clear_note_reaction(p_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  delete from public.note_reactions where note_owner_id = p_owner and reactor_id = v_uid;
end $$;

revoke all on function public.follow_user(uuid) from anon;
revoke all on function public.unfollow_user(uuid) from anon;
revoke all on function public.react_to_note(uuid, text) from anon;
revoke all on function public.clear_note_reaction(uuid) from anon;
grant execute on function public.follow_user(uuid) to authenticated;
grant execute on function public.unfollow_user(uuid) to authenticated;
grant execute on function public.react_to_note(uuid, text) to authenticated;
grant execute on function public.clear_note_reaction(uuid) to authenticated;

-- ── lock down direct client notification inserts ─────────────────────────────
drop policy if exists "notifications: auth insert" on public.notifications;
create policy "notifications: no client insert" on public.notifications
  for insert with check (false);
