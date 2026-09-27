-- A Shot's length, and the part of it that plays.
--
-- Shots had no length limit at all. The only guard was the 50 MB bucket cap,
-- so a three-minute clip was a perfectly valid Shot in a feed people flick
-- through. These three columns are what a cap and a trim need.
--
-- The trim is metadata, not a cut: the uploaded file is untouched and the
-- player shows the chosen range. That is the same shape `track` already has —
-- a Shot's song has always been a column played alongside the video rather
-- than mixed into it — so nothing here needs the video re-encoded on a phone.
-- The cost of that choice is honest and worth stating: a long clip trimmed
-- short still uploads in full.
--
-- All three are nullable. Every Shot that already exists has no trim and no
-- recorded duration, and must keep playing exactly as it does.

alter table public.shots
  add column if not exists duration_secs numeric,
  add column if not exists trim_start    numeric,
  add column if not exists trim_end      numeric;

comment on column public.shots.duration_secs is
  'Length of the uploaded file in seconds. Null on Shots posted before it was recorded.';
comment on column public.shots.trim_start is
  'Seconds into the file where playback starts. Null means from the beginning.';
comment on column public.shots.trim_end is
  'Seconds into the file where playback stops. Null means play to the end.';

-- A trim that is backwards or negative would make the player loop on nothing,
-- so it is rejected here rather than guarded at each of the places that read
-- it. Null on either side stays legal: it means "no bound on this side".
alter table public.shots
  drop constraint if exists shots_trim_range_valid;

alter table public.shots
  add constraint shots_trim_range_valid check (
    (trim_start is null or trim_start >= 0)
    and (trim_end is null or trim_end > 0)
    and (trim_start is null or trim_end is null or trim_end > trim_start)
  );

alter table public.shots
  drop constraint if exists shots_duration_positive;

alter table public.shots
  add constraint shots_duration_positive check (
    duration_secs is null or duration_secs > 0
  );

-- The owner writes these when posting. The table-level grant already covers
-- inserts by the author; these columns carry no privilege of their own, so
-- there is nothing to lock down the way profiles' privileged columns are.
