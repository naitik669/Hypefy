-- The nightly stats job exists in production and in no migration.
--
-- 0029 wrote the cron.schedule call and left it commented out. Somebody
-- scheduled it by hand afterwards, so cron.job has had an active
-- capture-creator-daily-stats row on '10 0 * * *' the whole time, and
-- ops_readiness — which checks cron.job against a list of expected names,
-- and has listed this one since 0163 — reported it present and correct.
--
-- So nothing is broken. What is broken is that the schedule lives only in
-- the database: rebuild this project from its migrations and the job is
-- silently absent, while ops_readiness says so only after somebody looks.
-- A schedule that exists by hand is a schedule nobody knows the shape of.
--
-- Idempotent. cron.schedule on an existing jobname updates it in place
-- rather than raising, so running this against the live database leaves
-- the job exactly as it already is, on the same schedule it already has.

select cron.schedule(
  'capture-creator-daily-stats',
  '10 0 * * *',
  $$ select public.capture_creator_daily_stats(); $$
);
