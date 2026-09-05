-- 0045 made private accounts actually private for posts and shots, and missed
-- shows entirely. Its SELECT policy is still `using (true)` from the baseline,
-- so any authenticated user could read any private account's Shows straight
-- from the REST API — no follow, no request, no approval.
--
-- Worse than the same bug on posts would have been: a Show flagged
-- is_showcase never expires, so this was not limited to a 24-hour window.
--
-- Same three-branch predicate as posts and shots, so the three content tables
-- now say exactly the same thing. The index 0045 added for this shape
-- (follows_following_follower_idx) already exists and serves this too.

alter policy "shows_select_public" on public.shows
  using (
    -- Your own Shows, always.
    user_id = (select auth.uid())
    -- Public authors, as before.
    or not exists (
      select 1 from public.profiles p
      where p.id = shows.user_id and coalesce(p.is_private, false)
    )
    -- Private authors, to their accepted followers only.
    or exists (
      select 1 from public.follows f
      where f.following_id = shows.user_id
        and f.follower_id = (select auth.uid())
    )
  );
