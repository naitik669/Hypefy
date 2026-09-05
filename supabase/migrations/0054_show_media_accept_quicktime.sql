-- shot-media accepts video/quicktime; show-media never did. iPhones hand back
-- .mov from the gallery, so picking one in /shows/add was rejected outright —
-- and that page surfaces the raw Supabase error, so the user was shown a mime
-- string. The two video buckets should accept the same formats.
--
-- Client-side caps now match their buckets exactly:
--   shot-media  50MB, mp4/webm/quicktime  (ShotComposer said 60, and both Shot
--                                          composers listed video/ogg, which
--                                          the bucket has never accepted)
--   show-media  25MB, + quicktime         (ShotPreview applied the 50MB Shot
--                                          limit to Shows as well)
update storage.buckets
   set allowed_mime_types = allowed_mime_types || array['video/quicktime']
 where id = 'show-media'
   and not ('video/quicktime' = any(allowed_mime_types));
