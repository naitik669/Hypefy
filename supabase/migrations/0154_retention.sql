-- Three tables that only ever grow, given a ceiling.
--
-- post_views, shot_views and notifications have no retention at all: every
-- impression and every notification ever generated is still here. They are
-- small today (1,626 / 31 / 746 rows), which is exactly why this goes in now
-- — the same reasoning as the indexes in 0149. A retention job written at ten
-- million rows is a migration that locks a hot table; written at a thousand
-- it is free, and by the time it matters it has been running for a year.
--
-- What each window costs, because deleting rows a user can see is a product
-- decision and not a cleanup:
--
--   post_views / shot_views  180 days. Two things read these. The feed's
--     ranking asks "have you already scrolled past this" (feed-rank.ts), which
--     only ever cares about the recent past. "Your activity → What you
--     watched" is a visible history, and it will stop going back further than
--     six months. That is far beyond the ACTIVITY_LIMIT rows it shows.
--
--   notifications            180 days, and only ones that have been READ. An
--     unread notification is something the reader has not seen yet, and no
--     age makes it right to delete that out from under them.
--
-- Each run is capped. A single unbounded DELETE is fine on a thousand rows
-- and is a long lock on ten million; the cap turns the first catch-up run
-- after a lapse into several short ones instead of one long one.

create or replace function public.prune_retention()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  -- Generous enough that nothing a reader is looking at disappears, small
  -- enough that these tables stay a fixed size rather than a growing one.
  keep_days constant int := 180;
  -- Rows per table per run. At the daily schedule this clears 60k views a
  -- day, which is far more than the app can generate for a long while.
  cap constant int := 20000;
begin
  delete from public.post_views
  where ctid in (
    select ctid from public.post_views
    where created_at < now() - make_interval(days => keep_days)
    limit cap
  );

  delete from public.shot_views
  where ctid in (
    select ctid from public.shot_views
    where created_at < now() - make_interval(days => keep_days)
    limit cap
  );

  delete from public.notifications
  where ctid in (
    select ctid from public.notifications
    where is_read
      and created_at < now() - make_interval(days => keep_days)
    limit cap
  );
end;
$function$;

-- Nobody calls this but cron, which runs as the table owner.
revoke all on function public.prune_retention() from public, anon, authenticated;

-- 03:40, between the subscription expiry at 03:15 and the rate-event prune
-- at 03:23, so the nightly jobs do not overlap.
select cron.schedule(
  'prune-retention',
  '40 3 * * *',
  $$select public.prune_retention();$$
);
