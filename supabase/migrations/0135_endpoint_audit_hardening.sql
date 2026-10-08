-- 0135 — what an audit of the live endpoints turned up
--
-- Nothing here is a bug report. The findings were about reach: functions
-- exposed wider than anything calls them, policies re-reading auth.uid()
-- per row, and foreign keys an account delete has to scan for. None of it
-- shows as a failure until there is enough data for it to.

-- ── 1. A pinned search_path on the four that lacked one ───────────────────
-- All four are SECURITY INVOKER, so this is not an escalation fix: it stops
-- a caller's own search_path deciding which table a trigger resolves.
alter function public.max_pinned_posts() set search_path to 'public';
alter function public.collection_items_stamp() set search_path to 'public';
alter function public.collections_guard_owner_fields() set search_path to 'public';
alter function public.playlist_member_cap() set search_path to 'public';

-- ── 2. Signed out, you may ask the version and nothing else ───────────────
-- can_see_profile answered "is this account private" to anyone with a user
-- id and no session; is_admin only ever answered false for them. Neither is
-- reachable now. min_app_build stays: the app asks it before anyone signs
-- in, to tell an old build to update.
revoke execute on function public.can_see_profile(uuid) from anon;
revoke execute on function public.is_admin() from anon;

-- ── 3. Endpoints nothing calls ────────────────────────────────────────────
-- Each is exposed at /rest/v1/rpc/<name> to every signed-in person while no
-- screen, policy, trigger, constraint or other function uses it. Closed
-- rather than dropped: an endpoint nobody calls is one nobody is watching,
-- and turning one back on is a grant.
revoke execute on function public.age_ok() from authenticated, anon;
revoke execute on function public.rehype_route(text, uuid, uuid) from authenticated, anon;
revoke execute on function public.top_share_targets(integer) from authenticated, anon;

-- ── 4. auth.uid() once per query, not once per row ────────────────────────
-- Wrapped in a select, Postgres treats it as a constant for the statement
-- instead of re-running it for every row it tests.
alter policy "user_keys: owner reads own" on public.user_keys using ((select auth.uid()) = user_id);
alter policy "profile_links: owner delete" on public.profile_links using ((select auth.uid()) = user_id);
alter policy "profile_links: owner insert" on public.profile_links with check ((select auth.uid()) = user_id);
alter policy "profile_links: owner update" on public.profile_links
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "post_views insert own" on public.post_views with check (viewer_id = (select auth.uid()));
alter policy "post_views read own or as author" on public.post_views
  using (viewer_id = (select auth.uid())
         or exists (select 1 from public.posts p where p.id = post_views.post_id and p.user_id = (select auth.uid())));

-- ── 5. The foreign keys deleting an account has to cascade through ────────
-- Without a covering index, removing one row means a full scan of each
-- child table. Account deletion walks every one of these.
create index if not exists post_views_viewer_idx on public.post_views(viewer_id);
create index if not exists poll_votes_voter_idx on public.poll_votes(voter_id);
create index if not exists note_reactions_reactor_idx on public.note_reactions(reactor_id);
create index if not exists note_hypes_hyper_idx on public.note_hypes(hyper_id);
create index if not exists reposts_via_user_idx on public.reposts(via_user_id);
create index if not exists shot_reposts_via_user_idx on public.shot_reposts(via_user_id);
create index if not exists oneshots_sender_idx on public.oneshots(sender_id);
create index if not exists oneshots_conversation_idx on public.oneshots(conversation_id);
create index if not exists oneshots_opened_by_idx on public.oneshots(opened_by);
create index if not exists close_friends_friend_idx on public.close_friends(friend_id);
create index if not exists favorites_friend_idx on public.favorites(friend_id);
create index if not exists pinned_viewers_pinned_user_idx on public.pinned_viewers(pinned_user_id);
create index if not exists group_call_participants_user_idx on public.group_call_participants(user_id);
create index if not exists showcase_items_show_idx on public.showcase_items(show_id);
create index if not exists showcase_items_shot_idx on public.showcase_items(shot_id);
