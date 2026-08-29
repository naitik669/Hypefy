-- Document attachments in DMs. chat-media previously accepted image/video
-- mimes only, so a document send would have been rejected at upload.
--
-- Deliberately a tight allowlist rather than opening the bucket up: text/html
-- and image/svg+xml are excluded because both can carry script, and anything
-- executable is excluded outright. Documents land in the SAME public bucket as
-- chat photos, so — exactly like photos today — anyone holding the URL can
-- read them indefinitely. That's consistent with existing behaviour rather
-- than a new weakness, but it does mean a document is not private just
-- because the conversation is; OneShot remains the only genuinely
-- self-destructing attachment.
--
-- No DDL needed for the new message kind: messages.kind is a bare text column
-- with no CHECK constraint (0001_baseline.sql:625), so 'document' works as-is.
-- The filename/size ride in messages.body as JSON, mirroring how voice notes
-- already store {url, duration} there — no schema change either.
update storage.buckets
set allowed_mime_types = array[
  -- existing image + video types, preserved
  'image/jpeg','image/jpg','image/png','image/gif','image/webp','image/heic',
  'video/mp4','video/webm','video/quicktime','video/mov',
  -- documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip'
]
where id = 'chat-media';
