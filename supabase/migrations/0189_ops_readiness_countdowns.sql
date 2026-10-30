-- 0188 added the deliver-countdown-reminders job; it joins the list
-- ops_readiness() checks, or the readiness screen would report all green
-- while the Countdown reminders never went out.
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
$function$;
