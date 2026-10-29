-- Every Show failed to publish after 0183: "Couldn't publish that. Try again."
--
-- 0183 pointed the shows SELECT policy at can_see_show(id). The creator
-- inserts with .select("id"), which is INSERT ... RETURNING, and a returned
-- row has to pass the SELECT policy too. can_see_show is a STABLE function
-- that looks the Show up in public.shows by id — and inside the statement
-- that is inserting it, the new row is not yet visible to that lookup. So it
-- answered false, RETURNING was refused, and Postgres rolled the insert back
-- as a row-level security violation (42501, a 403 to the client). The file
-- had already gone up to show-media, so each attempt left one behind.
--
-- The owner passes can_see_show on every branch anyway — removed, expired,
-- audience, hidden-from all let the author through — so answering for the
-- owner on the row's own column first changes nobody's access. It only lets
-- the author see the row they are creating before the lookup can.

alter policy "shows_select_public" on public.shows
  using ((select auth.uid()) = user_id or public.can_see_show(id));
