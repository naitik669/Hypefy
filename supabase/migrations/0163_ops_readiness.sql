-- The half of readiness that lives in the database.
--
-- /api/readiness answers "is this deployment configured" by reading
-- environment variables. Everything that went wrong in the last two days was
-- the other kind of question — state, not config:
--
--   * Eight reports sat open for up to 142 days. Nothing showed that.
--   * `conversation_members` was missing from the realtime publication for
--     the life of the app, so six subscriptions quietly received nothing.
--   * The media verification job will sit inert forever if the Vault half of
--     its secret is never created, and the env half cannot see the Vault.
--
-- The pattern is the same each time: a thing nobody can see does not get
-- done. So this reports state, and /api/readiness shows it next to the
-- configuration, with its own verdict so neither can mask the other.
--
-- Booleans and counts only. Never a secret's value — `moderation_secret_set`
-- answers whether a row exists, which is the only part anybody needs.

/**
 * Operational state a deployment cannot see from its own environment.
 *
 * Admin-gated like report_sla(), and for the same reason: together these
 * answers describe what is and is not defended.
 */
create or replace function public.ops_readiness()
returns table (
  cron_expected integer,
  cron_active integer,
  cron_missing text[],
  moderation_secret_set boolean,
  fingerprints_unverified integer,
  fingerprints_oldest_unverified_hours integer,
  blocked_media_count integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  -- Named rather than counted from cron.job, so a job that was never
  -- created is as visible as one that was switched off. Counting what
  -- exists can only ever tell you about what exists.
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
    'verify-media-hashes'
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

revoke all on function public.ops_readiness() from public, anon;
grant execute on function public.ops_readiness() to authenticated;
