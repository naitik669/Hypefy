-- Per-chat lock, screenshot-alert toggle, vanish mode, auto-delete timer, and
-- hide-read-receipts. All chat-scoped columns are on `conversations` (shared,
-- one state for everyone in the chat) except `locked_at`, which is
-- deliberately per-member on `conversation_members` — locking a chat hides it
-- for YOU, not for the other person too.

alter table public.conversation_members
  add column if not exists locked_at timestamptz;
-- No new RLS policy needed: "conv_members: update own" (0001_baseline.sql:619)
-- already lets a member write any column of their own row.

alter table public.conversations
  add column if not exists screenshot_alert_at timestamptz,
  add column if not exists vanish_mode boolean not null default false,
  add column if not exists auto_delete_after interval;

alter table public.profiles
  add column if not exists hide_read_receipts boolean not null default false;
-- No new RLS policy needed: "Users can update their own profile"
-- (0001_baseline.sql:54) already permits this.

-- ── Inbox masking ──────────────────────────────────────────────────────────
-- A locked chat stays visible in the inbox (not hidden — hiding would look
-- like a bug and swallow the unread badge) but its content is masked.
-- last_sender_id is deliberately left untouched: messages/page.tsx uses it to
-- compute `lastMine`/unread state, and it's never rendered, so masking it
-- would silently break unread detection for locked threads without hiding
-- anything additional.
create or replace function public.get_inbox_summary(p_conversation_ids uuid[])
returns table (
  conversation_id uuid,
  last_body text,
  last_kind text,
  last_created_at timestamptz,
  last_sender_id uuid,
  unread_count int
)
language sql stable security definer set search_path = public as $$
  with mine as (
    select cm.conversation_id, cm.last_read_at, cm.locked_at
    from public.conversation_members cm
    where cm.user_id = (select auth.uid())
      and cm.conversation_id = any(p_conversation_ids)
  ),
  last_msg as (
    select distinct on (m.conversation_id)
           m.conversation_id, m.body, m.kind, m.created_at, m.sender_id
    from public.messages m
    where m.conversation_id in (select mine.conversation_id from mine)
    order by m.conversation_id, m.created_at desc
  ),
  unread as (
    select m.conversation_id, count(*)::int as n
    from public.messages m
    join mine on mine.conversation_id = m.conversation_id
    where m.sender_id <> (select auth.uid())
      and (mine.last_read_at is null or m.created_at > mine.last_read_at)
    group by m.conversation_id
  )
  select mine.conversation_id,
         case when mine.locked_at is not null then null else lm.body end,
         case when mine.locked_at is not null then 'locked' else lm.kind end,
         lm.created_at, lm.sender_id,
         coalesce(u.n, 0)
  from mine
  left join last_msg lm on lm.conversation_id = mine.conversation_id
  left join unread   u  on u.conversation_id  = mine.conversation_id;
$$;

revoke all on function public.get_inbox_summary(uuid[]) from public, anon;
grant execute on function public.get_inbox_summary(uuid[]) to authenticated;

-- ── Shared-state toggles ───────────────────────────────────────────────────
-- conversations has no self-update RLS policy (only "conv: members read"
-- exists, 0001_baseline.sql:538), so every write here needs an RPC. Each
-- posts a system-kind notice via the existing send_message so both members
-- see the state change inline, in the same channel they already subscribe to
-- — no new realtime plumbing needed. `kind` has no CHECK constraint
-- (0001_baseline.sql:625), so 'system' inserts with zero DDL.

create or replace function public.toggle_screenshot_alert(p_conversation_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid()); v_now_on boolean; v_name text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_conv_member(p_conversation_id) then raise exception 'Not a member'; end if;

  update public.conversations
    set screenshot_alert_at = case when screenshot_alert_at is null then now() else null end
    where id = p_conversation_id
    returning (screenshot_alert_at is not null) into v_now_on;

  select coalesce(display_name, username, 'Someone') into v_name
    from public.profiles where id = v_uid;
  perform public.send_message(
    p_conversation_id,
    v_name || ' turned screenshot notifications ' || (case when v_now_on then 'on' else 'off' end),
    'system'
  );
  return v_now_on;
end $$;

create or replace function public.toggle_vanish_mode(p_conversation_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid()); v_now_on boolean; v_name text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_conv_member(p_conversation_id) then raise exception 'Not a member'; end if;

  update public.conversations
    set vanish_mode = not vanish_mode
    where id = p_conversation_id
    returning vanish_mode into v_now_on;

  select coalesce(display_name, username, 'Someone') into v_name
    from public.profiles where id = v_uid;
  perform public.send_message(
    p_conversation_id,
    v_name || ' turned vanish mode ' || (case when v_now_on then 'on' else 'off' end),
    'system'
  );
  return v_now_on;
end $$;

-- set_auto_delete: p_after is one of null (off), '24 hours', '7 days', '30 days'.
-- Validated against an allow-list rather than accepting any interval, so this
-- can't be pointed at something absurd (a 3-second timer, a 10-year one).
create or replace function public.set_auto_delete(p_conversation_id uuid, p_after interval)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid()); v_name text; v_label text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_conv_member(p_conversation_id) then raise exception 'Not a member'; end if;
  if p_after is not null and p_after not in (interval '24 hours', interval '7 days', interval '30 days') then
    raise exception 'Invalid auto-delete duration';
  end if;

  update public.conversations set auto_delete_after = p_after where id = p_conversation_id;

  v_label := case
    when p_after is null then 'off'
    when p_after = interval '24 hours' then '24 hours'
    when p_after = interval '7 days' then '7 days'
    else '30 days'
  end;
  select coalesce(display_name, username, 'Someone') into v_name
    from public.profiles where id = v_uid;
  perform public.send_message(
    p_conversation_id,
    v_name || ' set messages to auto-delete after ' || v_label,
    'system'
  );
end $$;

revoke all on function public.toggle_screenshot_alert(uuid) from public, anon;
grant execute on function public.toggle_screenshot_alert(uuid) to authenticated;
revoke all on function public.toggle_vanish_mode(uuid) from public, anon;
grant execute on function public.toggle_vanish_mode(uuid) to authenticated;
revoke all on function public.set_auto_delete(uuid, interval) from public, anon;
grant execute on function public.set_auto_delete(uuid, interval) to authenticated;

-- ── Auto-delete reaper ──────────────────────────────────────────────────────
-- Runs hourly rather than nightly: a nightly cadence on a '24 hours' timer
-- could let a message linger up to ~47h in the worst case (created right
-- after one run, purged only at the next). Hourly caps the worst case at
-- ~1h past the chosen duration, which matches what "24 hours" implies.
create or replace function public.purge_expired_messages() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.messages m
  using public.conversations c
  where m.conversation_id = c.id
    and c.auto_delete_after is not null
    and m.created_at < now() - c.auto_delete_after;
end $$;

revoke all on function public.purge_expired_messages() from public, anon, authenticated;

select cron.schedule('purge-expired-messages', '0 * * * *', 'select public.purge_expired_messages();');
