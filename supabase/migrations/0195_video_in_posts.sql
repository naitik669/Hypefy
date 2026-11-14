-- A post can carry a video, anywhere in its carousel.
--
-- Posts have always been up to ten photos in `image_urls`, and that is the
-- shape 28 files in src/ read. Rather than change it, this adds one ordered
-- list beside it:
--
--   media = [{"kind":"image","url":"…"},
--            {"kind":"video","url":"…","poster":"…","duration":12.5}]
--
-- `media` is the truth for a new post, and `image_url` / `image_urls` are
-- still written with its photo slots — so every existing reader keeps
-- working with no change at all, and a reader that has been taught about
-- `media` prefers it. There is no backfill: a row with no `media` is already
-- perfectly described by its photo columns, and src/lib/post-media.ts
-- derives the slots on read. A backfill would be a migration that could
-- half-finish for no gain.
--
-- Validation is NOT here. src/lib/post-media.ts is the only validator, the
-- same arrangement 0182 chose for a Show's stickers and for the same reason:
-- a half-valid slot has to be dropped on read, which is a decision about
-- meaning, and meaning does not belong in a CHECK. What is here is the
-- structural floor — an array, bounded in length and size — so a crafted
-- payload cannot make a row that costs anything to read.
--
-- Note the column-level grants. This table does not grant at table level:
-- `authenticated` has INSERT and UPDATE on a named list of columns and both
-- roles have SELECT on another. A new column is invisible and unwritable
-- until it is named, so the grants below are not optional tidying.

alter table public.posts
  add column if not exists media jsonb;

-- Ten slots, matching MAX_POST_SLOTS, and a size bound so one row cannot be
-- made expensive to read. Ten slots of url + poster + duration is about 3 kB.
alter table public.posts
  drop constraint if exists posts_media_shape;
alter table public.posts
  add constraint posts_media_shape check (
    media is null
    or (
      jsonb_typeof(media) = 'array'
      and jsonb_array_length(media) <= 10
      and pg_column_size(media) <= 8192
    )
  );

grant select (media) on public.posts to anon, authenticated;
grant insert (media), update (media) on public.posts to authenticated;

-- ── where the clips live ─────────────────────────────────────────────────

-- Its own bucket rather than shot-media. The two have different retention
-- and different moderation paths, and a post's video sharing a prefix with
-- a Shot's would make "delete every Shot's media" an impossible query to
-- write safely. Limits copied from shot-media: 50 MB, and image/jpeg is
-- allowed because the poster frame is stored alongside the clip.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-videos',
  'post-videos',
  true,
  52428800,
  array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Read is public because the bucket is public, the way shot-media is; only
-- writing needs a policy. First folder segment is the owner's id, so one
-- person cannot write into or delete from another's prefix.
drop policy if exists "post-videos: own upload" on storage.objects;
create policy "post-videos: own upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "post-videos: own delete" on storage.objects;
create policy "post-videos: own delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'post-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- And a select policy, which the sentence above ("only writing needs a
-- policy") gets wrong in a way that cost a day on avatars and banners.
--
-- A public bucket needs no select policy to be READ — that goes over the
-- CDN path, which never consults RLS. But storage reads the row back on an
-- upsert, and Postgres applies select policies to a row an insert RETURNS.
-- With no select policy that insert is refused as "new row violates
-- row-level security policy", an error about the write caused by the read.
-- avatars and banners were in exactly this state; see 0196.
--
-- Same predicate as the two above, so it grants nothing new: every object
-- here is already world-readable over the CDN.
drop policy if exists "post-videos: own select" on storage.objects;
create policy "post-videos: own select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'post-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
