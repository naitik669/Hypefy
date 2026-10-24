-- The six foreign-key indexes yesterday's migrations forgot.
--
-- 0145 added ten of these and set the standard; 0157 and 0162 then introduced
-- six new references to `profiles` without covering any of them. Found by
-- re-reading the performance advisor rather than by noticing at the time,
-- which is the honest account: the rule existed and the new tables did not
-- follow it.
--
-- Every one is ON DELETE SET NULL against profiles, which is precisely the
-- case where the index earns its keep. Deleting an account has to find the
-- referencing rows in each table to null them, and without an index that is a
-- sequential scan per table per deletion. Account deletion is a real
-- operation on a path that 0147 already had to repair once, and
-- media_fingerprints is the table designed to grow fastest of anything here —
-- one row per uploaded image, forever.
--
-- Free now, at tens of rows. The same argument as 0149: an index is cheap to
-- add while a table is small and locks a hot one later.

create index if not exists blocked_media_added_by_idx
  on public.blocked_media (added_by);

create index if not exists media_fingerprints_user_idx
  on public.media_fingerprints (user_id);

create index if not exists reports_acknowledged_by_idx
  on public.reports (acknowledged_by);

create index if not exists reports_resolved_by_idx
  on public.reports (resolved_by);

create index if not exists message_reports_acknowledged_by_idx
  on public.message_reports (acknowledged_by);

create index if not exists message_reports_resolved_by_idx
  on public.message_reports (resolved_by);
