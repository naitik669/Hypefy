-- Guard against raw oversized uploads: the client crop pipeline outputs
-- ~80-300KB JPEGs, so anything over 1.5MB is a bypass and would make the
-- next/image optimizer time out (see scripts/fix-oversized-images.mjs).
update storage.buckets
  set file_size_limit = 1572864 -- 1.5MB
  where id = 'post-images';
