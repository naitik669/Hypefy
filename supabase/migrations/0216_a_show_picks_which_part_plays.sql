-- A video Show chooses which part of the clip plays.
--
-- Worth being exact about what this fixes, because the obvious reading is
-- wrong. A long video Show has never been able to trap a viewer: the viewer
-- has capped a video Show at SHOW_VIDEO_MAX_MS — 30 seconds — on screen
-- since show-media was written, however long the file is. The bucket takes
-- 25 MB, which is minutes of low-bitrate video, and the rest was simply
-- never shown.
--
-- What a Show had no say in was WHICH 30 seconds. It was always the first,
-- because a video Show skipped the arrange step and so reached publishShow
-- with no edit at all. Somebody filming a thing that happens 40 seconds in
-- could not post it as a Show.
--
-- Metadata, not a cut, exactly as shots.trim_start has been: the uploaded
-- file is untouched and the player shows the chosen range. Same two columns,
-- same numeric type, same check constraint — a Show and a Shot are read by
-- the same playbackWindow helper, so storing it differently would mean two
-- shapes meaning one thing.
--
-- Nullable with no backfill. Null means "no bound", which is what every
-- Show posted before this already says and what the viewer already does.

alter table public.shows
  add column if not exists trim_start numeric(9,3),
  add column if not exists trim_end numeric(9,3);

-- Copied from shots_trim_range_valid rather than invented: a zero-length or
-- inverted window freezes playback on a loop of nothing.
alter table public.shows
  drop constraint if exists shows_trim_range_valid;
alter table public.shows
  add constraint shows_trim_range_valid check (
    (trim_start is null or trim_start >= 0)
    and (trim_end is null or trim_end > 0)
    and (trim_start is null or trim_end is null or trim_end > trim_start)
  );

-- shows grants per column, so a new one is invisible and unwritable until
-- it is named — the trap poster_url hit in 0213 and creator_mode in 0207.
grant select (trim_start, trim_end) on public.shows to anon, authenticated;
grant insert (trim_start, trim_end) on public.shows to authenticated;
