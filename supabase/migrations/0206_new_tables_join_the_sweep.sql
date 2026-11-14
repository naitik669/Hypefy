-- profile_views and share_events join the retention sweep.
--
-- Same reason shot_watch_stats did in 0203: 0154 set the rule at 180 days
-- for per-person history, and a table created after it and left out
-- becomes the one place that history lives for ever. profile_views is the
-- more pointed of the two — it is a record of who looked at whom, which is
-- exactly the kind of thing that should expire on a schedule rather than
-- because somebody remembered.
--
-- share_events is kept to the same window for consistency, though it is a
-- record of what somebody did with their own share button rather than of
-- being watched.

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

  delete from public.profile_views
  where ctid in (
    select ctid from public.profile_views
    where created_at < now() - make_interval(days => keep_days)
    limit cap
  );

  delete from public.share_events
  where ctid in (
    select ctid from public.share_events
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
