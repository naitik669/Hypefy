-- Stop signed-out visitors enumerating every file in the public buckets.
--
-- Eight SELECT policies on storage.objects were granted to PUBLIC, one per
-- public bucket. Measured as the `anon` role: 83 objects listable in
-- post-images and 25 in avatars.
--
-- Why that matters more than "the bucket is public anyway": a public bucket
-- already serves /storage/v1/object/public/... without consulting RLS, so
-- these policies were never what made the images load. What they added was
-- the ability to LIST — to walk `post-images/<uid>/` for any uid, and uids
-- are public. Object names are `<uid>/<timestamp>.<ext>`.
--
-- And the app hides content at the database layer, not the storage layer.
-- A private account's photos, an archived post's photos and the photos of a
-- post an admin has taken down all still sit in the bucket under a
-- predictable name. Listing hands over exactly the set the database is
-- refusing to show.
--
-- Checked before writing this: nothing in src/ calls storage .list() from
-- the client, and account deletion walks the objects with the service-role
-- client (src/lib/account-files.ts), which bypasses RLS and is unaffected.
--
-- chat_media_select and voice_notes_select are NOT touched. They are
-- granted to `authenticated` and gated on can_read_chat_media, which is the
-- shape the others should have had.
--
-- This does not make the media private — a guessed URL still serves. It
-- removes the index. Real privacy for private and removed content means
-- private buckets and signed URLs, which is a larger change and is tracked
-- separately.

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "banners_public_read" on storage.objects;
drop policy if exists "comment_images_public_read" on storage.objects;
drop policy if exists "cosmetics: public read" on storage.objects;
drop policy if exists "page-media: public read" on storage.objects;
drop policy if exists "post-images: public read" on storage.objects;
drop policy if exists "shot-media: public read" on storage.objects;
drop policy if exists "show_media_public_read" on storage.objects;
