-- A hashtag's page lists every post and Shot under one tag.
--
-- Shots already had an index for "which rows carry this tag"
-- (shots_hashtags_idx). Posts did not, so the same question read every post.

create index if not exists posts_hashtags_idx on public.posts using gin (hashtags);
