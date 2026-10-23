-- Indexes and constraints, created now because now is when they are free.
--
-- Supabase runs each migration in a transaction, so CREATE INDEX
-- CONCURRENTLY is not available. Every index below therefore takes a write
-- lock on its table for as long as the build takes. At 30 posts and 433
-- messages that is milliseconds. On a launched app it is an outage.
--
-- That timing, not severity, is why this batch jumps ahead of several more
-- serious findings. These are the cheapest they will ever be.
--
-- Checked against the live data before writing: no two usernames differ only
-- by case, none fail the format below, and the longest caption, comment,
-- message and bio are 106, 183, 832 and 61 characters. So every constraint
-- here validates immediately rather than needing a cleanup first.

-- ── 1. The query shape the feed actually uses ─────────────────────────────
--
-- posts and shots each have only a single-column user_id index, so
-- `.in(user_id, …).order(created_at desc)` — the home feed, the Following
-- and Hypers tabs, and every profile grid — sorts its result every time.
-- With up to 2,000 followed ids per home load, that is a 2,000-way merge
-- and a sort on each one.
--
-- Deliberately not partial. A `where archived_at is null` version would be
-- smaller, but the predicate reaches these queries through RLS rather than
-- the query text, and an index the planner declines to match is worse than
-- a slightly larger one it always can.

create index if not exists posts_user_created_idx on public.posts (user_id, created_at desc);
create index if not exists shots_user_created_idx on public.shots (user_id, created_at desc);

-- ── 2. Usernames ──────────────────────────────────────────────────────────
--
-- profiles_username_key is UNIQUE but case-sensitive, and 0050 grants
-- UPDATE (username) to authenticated. The format is checked only in
-- setup-profile/actions.ts, so a direct PostgREST PATCH could take "Alice"
-- while "alice" existed, or set an empty string, or a megabyte of text.
--
-- Note which half does the work. Once the format check is in place every
-- username is lower-case, so the existing UNIQUE already implies
-- case-insensitive uniqueness — a dry run confirmed the format check is
-- what refuses "Alice", not the index. The index earns its place as the
-- one the mention triggers can use: they match on
-- `lower(username) = lower(mention)` and have had nothing to use, so every
-- post, Shot and comment insert has been scanning profiles once per
-- mention. It is also the backstop if the format check is ever relaxed.

create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));

alter table public.profiles
  drop constraint if exists profiles_username_format,
  add constraint profiles_username_format
    check (username is null or username ~ '^[a-z0-9_.]{3,20}$') not valid;
alter table public.profiles validate constraint profiles_username_format;

-- ── 3. Indexes for the searches that scan today ───────────────────────────
--
-- The expressions must match the queries exactly or the planner ignores
-- them, so these mirror 0062 and 0114 character for character —
-- lower(coalesce(col, '')), not lower(col).

create index if not exists profiles_username_trgm_idx
  on public.profiles using gin (lower(coalesce(username, '')) gin_trgm_ops);
create index if not exists profiles_display_name_trgm_idx
  on public.profiles using gin (lower(coalesce(display_name, '')) gin_trgm_ops);
create index if not exists posts_caption_trgm_idx
  on public.posts using gin (lower(coalesce(caption, '')) gin_trgm_ops);
create index if not exists shots_caption_trgm_idx
  on public.shots using gin (lower(coalesce(caption, '')) gin_trgm_ops);

-- get_suggested_people filters on profile_tags && … with nothing to use.
create index if not exists profiles_tags_gin_idx
  on public.profiles using gin (profile_tags) where profile_completed;

-- ── 4. One of two identical indexes on the hottest write table ────────────
--
-- messages_conv_idx is (conversation_id, created_at) and
-- messages_conversation_created_idx is the same columns DESC. Postgres can
-- walk either direction, so one of them has only ever cost write
-- amplification on the table that takes the most writes. The DESC one stays
-- because every read here is newest-first.

drop index if exists public.messages_conv_idx;

-- ── 5. Lengths the database enforces, not just the composer ───────────────
--
-- There is exactly one maxLength in the whole UI, so captions, comments,
-- messages and bios have had no ceiling at either end. A multi-megabyte
-- comment on a popular post is a denial of service against everyone who
-- loads it, and hashtags feed an unnest and a GIN index.
--
-- The numbers are far above anything real (the longest of each is listed at
-- the top of this file), so nothing existing is affected.

alter table public.posts
  drop constraint if exists posts_caption_len,
  add constraint posts_caption_len check (caption is null or char_length(caption) <= 2200) not valid;
alter table public.posts validate constraint posts_caption_len;

alter table public.posts
  drop constraint if exists posts_hashtags_cardinality,
  add constraint posts_hashtags_cardinality check (hashtags is null or cardinality(hashtags) <= 30) not valid;
alter table public.posts validate constraint posts_hashtags_cardinality;

alter table public.comments
  drop constraint if exists comments_body_len,
  add constraint comments_body_len check (body is null or char_length(body) <= 2000) not valid;
alter table public.comments validate constraint comments_body_len;

alter table public.messages
  drop constraint if exists messages_body_len,
  add constraint messages_body_len check (body is null or char_length(body) <= 4000) not valid;
alter table public.messages validate constraint messages_body_len;

alter table public.profiles
  drop constraint if exists profiles_bio_len,
  add constraint profiles_bio_len check (bio is null or char_length(bio) <= 500) not valid;
alter table public.profiles validate constraint profiles_bio_len;

alter table public.profiles
  drop constraint if exists profiles_display_name_len,
  add constraint profiles_display_name_len
    check (display_name is null or char_length(display_name) <= 50) not valid;
alter table public.profiles validate constraint profiles_display_name_len;
