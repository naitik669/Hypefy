-- Uploading an avatar or a banner failed with
--   new row violates row-level security policy for table "objects"
--
-- Not a write problem. avatars and banners had insert, update and delete
-- policies and no select policy at all: they are public buckets, so every
-- read in the app goes through the CDN path, which does not consult RLS.
-- Nothing needed to select from storage.objects, so nothing ever did.
--
-- Both upload call sites — SetupStepper during onboarding and
-- EditProfileForm — pass `upsert: true`. That makes storage-api read the
-- row back, and Postgres applies select policies to a row an insert
-- returns. With no select policy the row comes back invisible and the
-- statement is rejected with the message above, which names the insert
-- rather than the read and sends you looking in the wrong place.
--
-- Shots upload fine because UploadProvider passes `upsert: false`, so
-- nothing is read back. That is the whole difference between the two.
--
-- So: let somebody read their own files. Same predicate as the insert,
-- update and delete policies already on these buckets — their own folder,
-- nothing else — and no new exposure, since both buckets are public and
-- every object in them is already world-readable over the CDN.

create policy avatars_user_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy banners_user_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
