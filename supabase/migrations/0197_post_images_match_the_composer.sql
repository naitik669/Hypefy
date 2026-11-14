-- The composer promised 10MB and the bucket refused anything over 1.5MB.
--
-- 0007 set post-images to 1572864 bytes. PostComposer has long told people
-- "max 10MB" and checked for exactly that before accepting a file. Every
-- photo between the two numbers passed every check on the way in and then
-- died at the upload as the generic "Couldn't share your post" — and since
-- a modern phone JPEG is 3-6MB, that was most photos, most of the time.
--
-- It hid in Auto mode especially, which is the default. A cropped photo is
-- re-encoded through a canvas and comes out small by accident; an Auto one
-- is passed through untouched on purpose, because not cutting anything off
-- is the whole point of that mode. So the failure looked intermittent and
-- was really "did you happen to crop it".
--
-- This is the same drift the comments in video-poster.ts were written to
-- prevent, and the same shape as the --nav-h / --nav-space bug: two numbers
-- that had to agree, kept in two places, quietly disagreeing.
--
-- So: the bucket is raised to the number the composer already promises, and
-- src/lib/post-image.ts is now the single place that number is written —
-- the composer imports MAX_POST_IMAGE_MB rather than keeping its own copy.
--
-- The ceiling is a backstop, not the plan. shrinkForUpload fits each photo
-- inside 2048px before it goes, so the usual upload is about a megabyte.
-- The ceiling still has to move because a PNG re-encoded at the same size
-- may not shrink much, and because a backstop that rejects ordinary input
-- is not a backstop.

update storage.buckets
   set file_size_limit = 10485760  -- 10MB, matching MAX_POST_IMAGE_MB
 where id = 'post-images';

-- Uploads here pass upsert: false, so unlike avatars and banners (0196)
-- nothing is read back and no select policy is required. Said out loud so
-- the next person does not have to re-derive it: if this bucket ever gains
-- an upsert, it needs an own-select policy the same day.
