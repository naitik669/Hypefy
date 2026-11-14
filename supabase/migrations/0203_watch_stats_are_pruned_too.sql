-- shot_watch_stats joins the retention sweep.
--
-- 0154 set the rule: per-viewer impression data is kept 180 days and then
-- deleted, 20,000 rows a run, nightly at 03:40. post_views and shot_views
-- are in it. A table created after it and left out would quietly become the
-- one place a person's viewing history lived forever, which is both the
-- wrong answer and a promise the privacy copy does not make.
--
-- Same keep window and same cap, so the sweep's cost does not change shape.
-- Dated off updated_at rather than a created_at, because a row here is
-- rewritten each time somebody watches again that day — the last touch is
-- what the retention window should be measured from, not the first.

create or replace function public.prune_retention()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  keep_days constant int := 180;
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

  delete from public.shot_watch_stats
  where ctid in (
    select ctid from public.shot_watch_stats
    where updated_at < now() - make_interval(days => keep_days)
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
