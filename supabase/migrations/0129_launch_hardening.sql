-- 0129_launch_hardening.sql
--
-- Four of the five things the backend audit of 2026-10-07 said must be fixed
-- before launch. All additive: nothing the deployed app reads is taken away
-- here. The fifth (private profile columns) is 0130, applied once the app
-- has stopped reading them.
--
--   1. my_private_profile(): the owner's own private fields, so the app no
--      longer needs to read them off the table.
--   2. Rate limits on every table a person can write to quickly.
--   3. A blocked person cannot write into a chat by inserting the row
--      themselves (send_message checked, the table did not).
--   4. storage_paths_of(): what the delete-account route needs to remove a
--      person's files, since Postgres cannot delete Storage objects.
--   5. ip_rate_limit(): an attempt limit that holds across server instances,
--      for endpoints that must work signed out (/api/gate).

-- ── 1. The owner's private fields ──────────────────────────────────────────

create or replace function public.my_private_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'date_of_birth', p.date_of_birth,
    'is_admin', p.is_admin,
    'suspension_reason', p.suspension_reason,
    'notif_prefs', p.notif_prefs,
    'referral_count', (select count(*) from public.profiles r where r.referred_by = p.id)
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke all on function public.my_private_profile() from public, anon;
grant execute on function public.my_private_profile() to authenticated;

-- Last seen is public by design, for people who show their activity. For
-- people who turned that off it was still being written, and still readable
-- by anyone who asked the table instead of the app.
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_seen_at = case when show_activity is false then null else now() end
   where id = auth.uid();
$$;

update public.profiles set last_seen_at = null where show_activity is false and last_seen_at is not null;

-- ── 2. Rate limits ─────────────────────────────────────────────────────────
--
-- One trigger function, the limit given where it is attached. rate_limit()
-- does nothing when there is no signed-in caller, so scheduled jobs
-- (publishing scheduled posts) are not counted.
--
-- The numbers are far above anything a person does (the busiest hour so far:
-- 3 posts, 9 messages in a minute, 7 hypes in a minute) and far below what a
-- script would.

create or replace function public.tg_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rate_limit(tg_argv[0], tg_argv[1]::int, tg_argv[2]::interval);
  return new;
end $$;

revoke all on function public.tg_rate_limit() from public, anon, authenticated;

drop trigger if exists rate_limit_posts on public.posts;
create trigger rate_limit_posts before insert on public.posts
  for each row execute function public.tg_rate_limit('post', '30', '1 hour');

drop trigger if exists rate_limit_shots on public.shots;
create trigger rate_limit_shots before insert on public.shots
  for each row execute function public.tg_rate_limit('shot', '20', '1 hour');

drop trigger if exists rate_limit_shows on public.shows;
create trigger rate_limit_shows before insert on public.shows
  for each row execute function public.tg_rate_limit('show', '40', '1 hour');

drop trigger if exists rate_limit_notes on public.notes;
create trigger rate_limit_notes before insert on public.notes
  for each row execute function public.tg_rate_limit('note', '40', '1 hour');

drop trigger if exists rate_limit_messages on public.messages;
create trigger rate_limit_messages before insert on public.messages
  for each row execute function public.tg_rate_limit('message', '90', '1 minute');

drop trigger if exists rate_limit_conversations on public.conversations;
create trigger rate_limit_conversations before insert on public.conversations
  for each row execute function public.tg_rate_limit('conversation', '40', '1 hour');

drop trigger if exists rate_limit_hypes on public.hypes;
create trigger rate_limit_hypes before insert on public.hypes
  for each row execute function public.tg_rate_limit('hype', '120', '1 minute');

drop trigger if exists rate_limit_reposts on public.reposts;
create trigger rate_limit_reposts before insert on public.reposts
  for each row execute function public.tg_rate_limit('repost', '60', '10 minutes');

drop trigger if exists rate_limit_shot_reposts on public.shot_reposts;
create trigger rate_limit_shot_reposts before insert on public.shot_reposts
  for each row execute function public.tg_rate_limit('repost', '60', '10 minutes');

drop trigger if exists rate_limit_saved_posts on public.saved_posts;
create trigger rate_limit_saved_posts before insert on public.saved_posts
  for each row execute function public.tg_rate_limit('save', '120', '1 minute');

drop trigger if exists rate_limit_saved_shots on public.saved_shots;
create trigger rate_limit_saved_shots before insert on public.saved_shots
  for each row execute function public.tg_rate_limit('save', '120', '1 minute');

drop trigger if exists rate_limit_saved_sounds on public.saved_sounds;
create trigger rate_limit_saved_sounds before insert on public.saved_sounds
  for each row execute function public.tg_rate_limit('save', '120', '1 minute');

-- ── 3. Blocked means blocked, however the row arrives ──────────────────────
--
-- The same test send_message makes, on the table itself. SECURITY DEFINER
-- because a person cannot read who has blocked them.

create or replace function public.tg_messages_refuse_blocked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then return new; end if;
  if exists (
    select 1 from public.conversation_members cm
    join public.blocked_users b on b.blocker_id = cm.user_id and b.blocked_id = v_me
    where cm.conversation_id = new.conversation_id and cm.user_id <> v_me
  ) then
    raise exception 'blocked';
  end if;
  return new;
end $$;

revoke all on function public.tg_messages_refuse_blocked() from public, anon, authenticated;

drop trigger if exists messages_refuse_blocked on public.messages;
create trigger messages_refuse_blocked before insert on public.messages
  for each row execute function public.tg_messages_refuse_blocked();

-- ── 4. A person's files, for the delete-account route ──────────────────────
--
-- Every bucket files things under the uploader's id, and Storage records the
-- uploader as owner. Either is enough to call a file theirs.

create or replace function public.storage_paths_of(p_user uuid)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where o.owner_id = p_user::text
     or o.name like p_user::text || '/%';
$$;

revoke all on function public.storage_paths_of(uuid) from public, anon, authenticated;
grant execute on function public.storage_paths_of(uuid) to service_role;

-- ── 5. Attempt limits for signed-out endpoints ─────────────────────────────
--
-- rate_events is keyed by user. This one is keyed by whatever the route
-- hands it (a hash of the action and the address, never the address).

create table if not exists public.ip_rate_events (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);
create index if not exists ip_rate_events_lookup_idx on public.ip_rate_events (key, created_at);
alter table public.ip_rate_events enable row level security;
revoke all on public.ip_rate_events from public, anon, authenticated;

/** True when the attempt is allowed. Every call counts as an attempt. */
create or replace function public.ip_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  select count(*) into v_count from public.ip_rate_events
   where key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
  insert into public.ip_rate_events (key) values (p_key);
  return v_count < p_limit;
end $$;

revoke all on function public.ip_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.ip_rate_limit(text, int, int) to service_role;

-- Both tables only ever grew. The longest window either is asked about is an
-- hour, so two days is generous.
select cron.unschedule('prune-rate-events') where exists (select 1 from cron.job where jobname = 'prune-rate-events');
select cron.schedule(
  'prune-rate-events',
  '23 3 * * *',
  $$delete from public.rate_events where created_at < now() - interval '2 days';
    delete from public.ip_rate_events where created_at < now() - interval '2 days';$$
);
