-- A Shot can be set to go up later.
--
-- Posts have had this since 0017 and Shots never did, which is the wrong
-- way round if anything: a Shot is the thing people film in the evening
-- and want out at a time somebody is awake.
--
-- Modelled on scheduled_posts exactly, including the part worth repeating:
-- the media is uploaded NOW and only the row is deferred. A phone that is
-- off at the scheduled minute cannot upload fifty megabytes, so deferring
-- the file would mean a scheduled Shot that silently never happened. What
-- waits is a row holding URLs that already exist.
--
-- ── no update policy, deliberately ──────────────────────────────────────
--
-- scheduled_posts has own read, own insert, own delete and no update, so a
-- scheduled thing can be cancelled but not edited. That is not an
-- oversight to correct here: editing would mean re-uploading media against
-- a row whose old objects nothing would then clean up. Delete and make
-- another is the honest shape until there is a reason for more.
--
-- ── the audience comes too ──────────────────────────────────────────────
--
-- 0210 gave Shots an audience an hour ago. A scheduled Shot that lost it
-- on the way across would publish to everybody — the same silent column
-- drop 0035 had to fix for aspect_ratio and 0209 for media, and the third
-- time this exact mistake has been available in this codebase.

create table if not exists public.scheduled_shots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  -- Already uploaded. See the header.
  media_url     text not null,
  poster_url    text,
  caption       text,
  hashtags      text[] not null default '{}',
  mentions      text[] not null default '{}',
  track         jsonb,
  duration_secs numeric,
  trim_start    numeric,
  trim_end      numeric,
  audience      text not null default 'everyone',
  scheduled_at  timestamptz not null,
  created_at    timestamptz not null default now(),
  constraint scheduled_shots_audience_known check (audience in ('everyone', 'hypers'))
);

create index if not exists scheduled_shots_due_idx
  on public.scheduled_shots (scheduled_at);

alter table public.scheduled_shots enable row level security;

drop policy if exists "scheduled_shots: own read" on public.scheduled_shots;
create policy "scheduled_shots: own read" on public.scheduled_shots
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "scheduled_shots: own insert" on public.scheduled_shots;
create policy "scheduled_shots: own insert" on public.scheduled_shots
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "scheduled_shots: own delete" on public.scheduled_shots;
create policy "scheduled_shots: own delete" on public.scheduled_shots
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.scheduled_shots from anon;
revoke all on public.scheduled_shots from authenticated;
grant select, insert, delete on public.scheduled_shots to authenticated;

-- ── the publisher ───────────────────────────────────────────────────────
--
-- Delete-returning-insert, as 0017 does: the row moves rather than being
-- copied and marked, so there is no state in which a Shot has been
-- published and its scheduled row still looks due. One statement, so a
-- crash between the two halves cannot leave it published twice either.
create or replace function public.publish_due_scheduled_shots()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_count int;
begin
  with due as (
    delete from public.scheduled_shots
    where scheduled_at <= now()
    returning user_id, media_url, poster_url, caption, hashtags, mentions,
              track, duration_secs, trim_start, trim_end, audience
  ), ins as (
    insert into public.shots (user_id, media_url, poster_url, caption, hashtags, mentions,
                              track, duration_secs, trim_start, trim_end, audience, created_at)
    select user_id, media_url, poster_url, caption, hashtags, mentions,
           track, duration_secs, trim_start, trim_end, audience, now()
    from due
    returning 1
  )
  select count(*) into v_count from ins;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.publish_due_scheduled_shots() from public, anon, authenticated;

select cron.schedule(
  'publish-scheduled-shots',
  '* * * * *',
  $$ select public.publish_due_scheduled_shots(); $$
);

-- ── and ops_readiness learns to expect it ───────────────────────────────
--
-- The list is the whole point of that function: a job nobody expects is a
-- job nobody notices has stopped. 0200 made the same point about the
-- stats job, which ran for months while existing in no migration.
create or replace function public.ops_readiness()
returns table(cron_expected integer, cron_active integer, cron_missing text[],
              moderation_secret_set boolean, fingerprints_unverified integer,
              fingerprints_oldest_unverified_hours integer, blocked_media_count integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  expected text[] := array[
    'publish-scheduled-posts',
    'publish-scheduled-shots',
    'capture-creator-daily-stats',
    'reap-oneshots',
    'purge-expired-messages',
    'expire-lapsed-subscriptions',
    'remind-trials-ending',
    'send-hype-summaries',
    'prune-rate-events',
    'prune-retention',
    'verify-media-hashes',
    'deliver-scheduled-messages',
    'reap-expired-shows',
    'deliver-countdown-reminders'
  ];
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select
    array_length(expected, 1),
    (select count(*)::int from cron.job j where j.jobname = any(expected) and j.active),
    (select coalesce(array_agg(e order by e), '{}')
       from unnest(expected) e
      where not exists (
        select 1 from cron.job j where j.jobname = e and j.active
      )),
    exists (select 1 from vault.decrypted_secrets where name = 'moderation_verify_secret'),
    (select count(*)::int from public.media_fingerprints where not verified),
    (select coalesce(max(extract(epoch from (now() - created_at)) / 3600), 0)::int
       from public.media_fingerprints where not verified),
    (select count(*)::int from public.blocked_media);
end;
$$;
