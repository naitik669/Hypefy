-- Expired Shows, and their media, eventually go.
--
-- Nothing has ever deleted a Show. There is no cron for it, no clause in
-- the policy before 0178, and 0154's retention sweep covers post_views,
-- shot_views and notifications but not this. Every Show ever posted is
-- still a row, and every picture is still a file in a bucket that takes
-- 25 MB each.
--
-- 0178 stopped expired Shows being *readable* by anyone but their author.
-- This stops them being *kept* for ever. Between the two the Show gets an
-- archive: thirty days where only its author can see it, which is where
-- one gets put on a Showcase board, and then it is gone.
--
-- Postgres cannot delete a Storage object; only the Storage API can. So
-- this posts one Show at a time to /api/shows/reap, which holds the
-- service key — the same shape as reap_oneshots (0033), down to reading
-- the shared secret out of the vault rather than baking it into a
-- migration the way notify_push_webhook did (its secret is in this
-- repo's git history for ever as a result).
--
-- BEFORE THIS DOES ANYTHING, the secret has to exist:
--   select vault.create_secret('<a long random string>', 'show_reap_secret', 'Shows reaper');
-- and the same value as SHOW_REAP_SECRET in the app's environment. Until
-- then the function returns immediately, so applying this early is safe
-- and simply reaps nothing.
--
-- Two kinds of Show are never reaped, and the route checks both again on
-- its own side rather than trusting the caller:
--   * one on a Showcase board, which is the point of a board;
--   * one flagged is_showcase, the pre-boards "keep this" flag that 0068
--     declared superseded and two code paths still write. It goes in
--     Phase 4; until then it still means "keep".

create or replace function public.reap_expired_shows()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'show_reap_secret';
  -- Not configured yet. Do nothing rather than post unauthenticated.
  if v_secret is null then return; end if;

  for v_row in
    select s.id
      from public.shows s
     where s.expires_at <= now() - interval '30 days'
       and coalesce(s.is_showcase, false) = false
       and not exists (
         select 1
           from public.showcase_items si
          where si.show_id = s.id
            and si.removed_at is null
       )
     -- Oldest first, and a ceiling: the first run after this ships has
     -- years of backlog to get through, and a thousand HTTP posts from
     -- one transaction is its own outage.
     order by s.expires_at
     limit 200
  loop
    perform net.http_post(
      url := 'https://www.hypefy.chat/api/shows/reap',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-show-reap-secret', v_secret
      ),
      body := jsonb_build_object('show_id', v_row.id)
    );
  end loop;
end $$;

revoke all on function public.reap_expired_shows() from public, anon, authenticated;

-- Daily, off the hour, away from the other jobs.
select cron.unschedule('reap-expired-shows')
 where exists (select 1 from cron.job where jobname = 'reap-expired-shows');
select cron.schedule('reap-expired-shows', '20 3 * * *', 'select public.reap_expired_shows();');

-- A new cron job joins the list ops_readiness() checks, or the readiness
-- screen would report "all green" while this one silently never ran.
-- The repo has a test that fails if a job it creates is missing here.
create or replace function public.ops_readiness()
returns table(
  cron_expected integer, cron_active integer, cron_missing text[],
  moderation_secret_set boolean, fingerprints_unverified integer,
  fingerprints_oldest_unverified_hours integer, blocked_media_count integer
)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  expected text[] := array[
    'publish-scheduled-posts',
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
    'reap-expired-shows'
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
$function$;
