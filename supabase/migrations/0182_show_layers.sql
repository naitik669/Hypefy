-- What is arranged on top of a Show.
--
-- A Show has been one picture and a caption since the baseline. This is
-- the column the editor writes: an ordered list of layers — words, a
-- sticker, a song, a poll, somebody's name — kept as data and rendered
-- live rather than flattened into the image when it is posted. That is
-- what keeps a poll votable, a song playable and a mention tappable, and
-- what lets a Show be edited afterwards.
--
-- The shape is read and checked in src/lib/show-layers.ts, which never
-- throws: an older row, a half-written one, or one from a version that
-- does not exist yet all have to read as "no layer" and leave the picture
-- standing. The constraints here are the coarse ones a database can hold
-- — it is an array, it is not enormous, there are not too many of them —
-- and not a schema. Postgres validating every payload shape would be a
-- second copy of readLayers that could disagree with the first.

alter table public.shows
  add column if not exists layers jsonb not null default '[]'::jsonb;

comment on column public.shows.layers is
  'Ordered list of overlay layers, back to front. Shape in src/lib/show-layers.ts.';

-- An array, at most twelve, and bounded in size. 24 KB is far more than
-- twelve layers of this shape need and far less than a column somebody
-- could hide a payload in.
alter table public.shows drop constraint if exists shows_layers_shape;
alter table public.shows add constraint shows_layers_shape check (
  jsonb_typeof(layers) = 'array'
  and jsonb_array_length(layers) <= 12
  and pg_column_size(layers) <= 24576
) not valid;

-- Added NOT VALID and validated separately so the table is not locked
-- while every existing row is checked; all of them are '[]' anyway.
alter table public.shows validate constraint shows_layers_shape;

-- 0150 revoked column-wide insert and grants one column at a time, so a
-- new column is unwritable by the client until it is named. Update is
-- granted too: unlike every other column here, a Show's layers can be
-- changed after it is posted — that is the point of keeping them as data.
grant insert (user_id, media_url, caption, track, linked_post_id, mentions, layers)
  on public.shows to authenticated;
grant update (is_showcase, layers) on public.shows to authenticated;

-- Note for Phase 3, when a poll layer can be voted on: a vote will point
-- at a layer id and a choice index, and this grant lets the author edit
-- the options underneath it afterwards. The options of a poll that has
-- been answered have to stop being editable at that point, or a vote
-- silently becomes a vote for something else.

