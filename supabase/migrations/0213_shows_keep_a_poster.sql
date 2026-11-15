-- A video Show gets a still of its own.
--
-- shows has one media column and nothing else: no poster, no duration, no
-- trim. So everywhere a Show is drawn small — a collab grid, a showcase, a
-- reply card — a video one is a live <video> element with BLANK_POSTER on
-- it, decoding in the background to show a single frame.
--
-- Two costs, and the second is the one that matters. It looks blank until
-- the decoder catches up, which on a slow connection is most of the time
-- somebody is looking at the grid. And a grid of eight video Shows is
-- eight decoders running to display eight still pictures, on a phone, in a
-- feed somebody is scrolling.
--
-- A Shot has had poster_url since it existed and publishShow simply never
-- captured one, even though capturePoster is right there and the Shot path
-- calls it four lines away.
--
-- Nullable, with no backfill. Every Show posted before this has no poster
-- and there is no way to make one without downloading and decoding each
-- clip server-side; the readers fall back to what they do today, which is
-- exactly what those rows already get. New ones get a still.

alter table public.shows
  add column if not exists poster_url text;

-- shows grants per column, so a new one is invisible and unwritable until
-- it is named — the same arrangement posts.media needed in 0195 and
-- creator_mode in 0207.
grant select (poster_url) on public.shows to anon, authenticated;
grant insert (poster_url) on public.shows to authenticated;
