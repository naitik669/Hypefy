-- Private accounts were not private.
--
-- `posts` and `shots` both had a SELECT policy of `using (true)`, and
-- `profiles.is_private` was consulted in exactly two places — the profile page
-- (`u/[username]/page.tsx`, via a client-side `isLocked` boolean) and the post
-- permalink. It appeared NOWHERE in the home, discover or search queries.
--
-- So two things were true at once:
--   * a private account's posts could surface in a stranger's For You feed,
--     because the feed never asked;
--   * and any authenticated user could read them straight from the API,
--     because the database never asked either.
--
-- The toggle in Settings promised something nothing enforced.
--
-- 0024 already did the hard half of this: it introduced follow_requests and
-- routed all follows through follow_user() so that following a private account
-- creates a PENDING request rather than an instant follow. That makes
-- `follows` a trustworthy "accepted follower" relation, which is what the
-- predicate below leans on.
--
-- Verified against production in a rolled-back transaction before applying:
-- with the author's account set private, the author saw all 7 of their posts,
-- an accepted follower saw all 7, a stranger saw 0, and anon saw 0.
--
-- Cost note: this adds two EXISTS lookups per candidate row. Both are on
-- primary/indexed columns (profiles.id, follows(following_id, follower_id)) and
-- auth.uid() is wrapped in a SELECT so it is evaluated once per statement
-- rather than once per row. If the feed's candidate windows grow much larger,
-- denormalising is_private onto posts is the next step — but that trades a
-- correctness guarantee for a cache, so not before it is measured.

alter policy "posts: anyone can read" on public.posts
  using (
    -- Your own posts, always.
    user_id = (select auth.uid())
    -- Public authors, as before.
    or not exists (
      select 1 from public.profiles p
      where p.id = posts.user_id and coalesce(p.is_private, false)
    )
    -- Private authors, to their accepted followers only.
    or exists (
      select 1 from public.follows f
      where f.following_id = posts.user_id
        and f.follower_id = (select auth.uid())
    )
  );

alter policy "shots: anyone can read" on public.shots
  using (
    user_id = (select auth.uid())
    or not exists (
      select 1 from public.profiles p
      where p.id = shots.user_id and coalesce(p.is_private, false)
    )
    or exists (
      select 1 from public.follows f
      where f.following_id = shots.user_id
        and f.follower_id = (select auth.uid())
    )
  );

-- The follower half of the predicate runs per candidate row, so it wants the
-- composite. follows_following_idx alone still needs a heap probe per match.
create index if not exists follows_following_follower_idx
  on public.follows (following_id, follower_id);
