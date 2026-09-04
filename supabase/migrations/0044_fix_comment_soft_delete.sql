-- Comment deletion has never worked. Not once, in 40 comments.
--
-- deleteComment() sets deleted_at, and Postgres rejects the write with
-- "new row violates row-level security policy". The UPDATE policy is fine
-- (own update, USING auth.uid() = user_id) and passes; what fails is the
-- check against the NEW row, because the SELECT policy reads
--
--   using (deleted_at is null)
--
-- so the moment a row is stamped deleted it stops being visible to its own
-- author, and the update that made it invisible is refused.
--
-- Verified against production rather than reasoned about: an owner updating
-- any other column on the same row succeeds; only setting deleted_at fails,
-- and widening this one policy in a rolled-back transaction made the
-- soft-delete succeed.
--
-- The fix is to let authors see their own deleted rows. The feed never shows
-- them regardless — every read path already filters .is("deleted_at", null)
-- — so nothing appears that did not appear before. This only stops the
-- policy from contradicting the write it is supposed to permit.
--
-- Nobody else's deleted comments become readable: the disjunct is scoped to
-- the author.

alter policy "comments: anyone can read non-deleted" on public.comments
  using (deleted_at is null or user_id = (select auth.uid()));
