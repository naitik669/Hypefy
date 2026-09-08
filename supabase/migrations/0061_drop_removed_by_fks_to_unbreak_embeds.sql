-- Regression fix for 0055. This is the one that made the Shots tab say
-- "The reel is empty" while five perfectly readable rows sat in the table.
--
-- 0055 added `removed_by uuid references public.profiles(id)` to posts, shots,
-- shows, comments and messages. Each already had exactly one foreign key to
-- profiles (the author), and PostgREST resolves an embed like
--
--     .select("..., profiles(display_name, username, avatar_hue, avatar_url)")
--
-- by finding THE relationship between the two tables. Given two, it refuses:
--
--     PGRST201: Could not embed because more than one relationship was found
--     for 'shots' and 'profiles'
--
-- The request ERRORS, so the client gets data: null and renders its empty
-- state. Nothing in the UI distinguishes "no rows" from "the query failed",
-- which is why this looked like missing content rather than a broken query.
--
-- Broken by it: the Shots tab, Shots in the home feed, Shot deep links, and
-- both comment queries in CommentsSheet.
--
-- Dropping the constraints rather than qualifying the embeds. Qualifying works
-- (profiles!shots_user_id_fkey) but has to be repeated at every call site and
-- leaves the trap armed for the next embed written against these five tables.
-- The constraint buys very little here: removed_by is written only by
-- admin_remove_content, from auth.uid(), which is by definition a real
-- profile. The columns, their data, and the moderation_actions audit trail are
-- untouched.
--
-- Note for whoever hits this next: `posts` is STILL ambiguous, and always was
-- — PostgREST also infers a many-to-many between posts and profiles through
-- poll_votes. That is why every posts embed in the codebase already says
-- profiles!posts_user_id_fkey. Nothing to fix there; just don't be surprised.
alter table public.posts    drop constraint if exists posts_removed_by_fkey;
alter table public.shots    drop constraint if exists shots_removed_by_fkey;
alter table public.shows    drop constraint if exists shows_removed_by_fkey;
alter table public.comments drop constraint if exists comments_removed_by_fkey;
alter table public.messages drop constraint if exists messages_removed_by_fkey;
