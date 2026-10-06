-- Uploads to shot-media and post-images go to your own folder, and nowhere else.
--
-- Both buckets let any signed-in account upload to any path:
--
--   with check (bucket_id = '...' and auth.uid() is not null)
--
-- Every other bucket ties the first folder of the path to the uploader. These
-- two did not, so one account could put a file under another account's
-- folder: content that then reads, by its address, as that person's, and that
-- they could delete but had never made. Neither bucket allows overwriting
-- through the app (uploads are upsert: false, and there is no update policy),
-- so this was planting files, not replacing them.
--
-- Every upload the app makes already uses `${userId}/...`, so nothing the app
-- does changes.

drop policy if exists "shot-media: auth upload" on storage.objects;
create policy "shot-media: own upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'shot-media'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists "post-images: auth upload" on storage.objects;
create policy "post-images: own upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );
