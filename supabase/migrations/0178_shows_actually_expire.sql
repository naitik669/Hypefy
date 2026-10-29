-- A Show that has expired stops being readable.
--
-- `expires_at` has been on the table since the baseline and has never
-- meant anything. No cron, no clause in the policy, nothing in 0154's
-- retention sweep: every "expired" Show is a filter in app queries only
-- (`.gt("expires_at", nowIso)`), so anyone holding the id could still
-- fetch the row and its 25 MB object over REST, for ever. The one
-- ephemeral feature with real server-side expiry is OneShot (0033).
--
-- The clause goes in the policy rather than in the app because the app's
-- filter is advice to itself. A policy is the rule.
--
-- Three things must keep reading an expired Show, and each is a branch:
--
--   * its author, which is what makes the archive an archive — the Show
--     is gone from everyone else's screen but still yours to look at and
--     to put on a Showcase board;
--   * an admin, or a reported Show could not be reviewed after a day;
--   * anybody who can see a Showcase board it sits on. A kept Show is
--     expired by definition, and two surfaces read straight through to
--     it — showcase/[showcaseId] embeds `shows(id, media_url, caption,
--     created_at, track)` and ShowcaseRail embeds `shows(media_url)`.
--     Without this branch a visitor's view of somebody's board would
--     quietly go blank, which is a worse bug than the one being fixed.
--
-- The branch only relaxes expiry. Privacy and takedown are separate
-- conjuncts above it and still apply, so a kept Show on a private
-- account's board stays behind the follow check exactly as it was.
--
-- The lookup is covered by showcase_items_show_idx (0135).

alter policy "shows_select_public" on public.shows
  using (
    -- taken down
    (removed_at is null or user_id = (select auth.uid()) or public.is_admin())
    -- private account
    and (
      user_id = (select auth.uid())
      or not exists (
        select 1 from public.profiles p
         where p.id = shows.user_id and coalesce(p.is_private, false)
      )
      or exists (
        select 1 from public.follows f
         where f.following_id = shows.user_id
           and f.follower_id = (select auth.uid())
      )
    )
    -- expired
    and (
      expires_at > now()
      or user_id = (select auth.uid())
      or public.is_admin()
      or exists (
        select 1
          from public.showcase_items si
          join public.showcases sc on sc.id = si.showcase_id
         where si.show_id = shows.id
           and si.removed_at is null
           and sc.removed_at is null
      )
    )
  );
