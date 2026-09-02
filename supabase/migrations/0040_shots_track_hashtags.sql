-- ───────────────────────────────────────────────────────────────────
-- 0040: Shots gain music and hashtags, and the UPDATE policy they never had.
--
-- Applied to fyaioseridqabockidyp on 2 Sep 2026, recorded in Supabase as
-- `shots_track_hashtags_and_update_policy`.
-- ───────────────────────────────────────────────────────────────────

-- 0012_music_tracks added `track jsonb` to notes, shows and posts and
-- skipped shots, so a Shot has never been able to carry a song. The
-- camera-first composer offers both, so the columns have to exist.
alter table public.shots
  add column if not exists track jsonb,
  add column if not exists hashtags text[] not null default '{}';

-- Same shape as posts.hashtags, so extractHashtags and parseTrack work
-- unchanged against either table.
create index if not exists shots_hashtags_idx on public.shots using gin (hashtags);

-- shots had SELECT, INSERT and DELETE policies but no UPDATE at all.
--
-- That silently broke the Showcase toggle in the Shot owner menu
-- (ReelsFeed): RLS filtered the update to zero rows, PostgREST returned no
-- error, and the UI flipped the label while nothing persisted. Any future
-- edit to a Shot would have failed the same silent way.
drop policy if exists "shots: own update" on public.shots;
create policy "shots: own update" on public.shots
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
