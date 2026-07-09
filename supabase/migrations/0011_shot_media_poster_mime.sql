-- Shot posters (JPEG frames captured at upload) live alongside the video
-- in shot-media; the bucket's MIME allowlist only permitted video.
update storage.buckets
  set allowed_mime_types = array['video/mp4','video/webm','video/quicktime','image/jpeg']
  where id = 'shot-media';
