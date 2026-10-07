-- A sound's page lists every Shot and post made with one song.
--
-- The song is saved whole, as JSON, on each row that uses it, so the page
-- is a search for rows by the song's id inside that JSON. These let that
-- search find them directly, newest first, without reading every row.
-- Partial, because most rows have no song.

create index if not exists shots_track_id_idx
  on public.shots ((track->>'id'), created_at desc) where track is not null;
create index if not exists posts_track_id_idx
  on public.posts ((track->>'id'), created_at desc) where track is not null;
