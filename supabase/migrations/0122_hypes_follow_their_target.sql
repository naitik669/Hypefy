-- Two pieces of tidying found by the Play Store readiness audit (2026-10-07).
--
-- 1. A hype outlived the thing it was on.
--
-- hypes(target_type, target_id) points at a post, Shot, comment or Show by
-- convention, with no foreign key, so deleting any of them left its hypes
-- behind: 54 rows pointing at nothing. The counters were right (they live on
-- the row that was deleted); the leftovers were only weight, and a wrong
-- answer waiting for the first query that counts hypes per person.
--
-- A trigger on each of the four tables takes the hypes with it, and the
-- existing leftovers are removed once.

create or replace function public.hypes_follow_their_target()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.hypes where target_type = tg_argv[0] and target_id = old.id;
  return old;
end $$;
revoke all on function public.hypes_follow_their_target() from public, anon, authenticated;

drop trigger if exists posts_take_their_hypes on public.posts;
create trigger posts_take_their_hypes after delete on public.posts
  for each row execute function public.hypes_follow_their_target('post');
drop trigger if exists shots_take_their_hypes on public.shots;
create trigger shots_take_their_hypes after delete on public.shots
  for each row execute function public.hypes_follow_their_target('shot');
drop trigger if exists comments_take_their_hypes on public.comments;
create trigger comments_take_their_hypes after delete on public.comments
  for each row execute function public.hypes_follow_their_target('comment');
drop trigger if exists shows_take_their_hypes on public.shows;
create trigger shows_take_their_hypes after delete on public.shows
  for each row execute function public.hypes_follow_their_target('show');

delete from public.hypes h where
     (h.target_type = 'post'    and not exists (select 1 from public.posts p    where p.id = h.target_id))
  or (h.target_type = 'shot'    and not exists (select 1 from public.shots p    where p.id = h.target_id))
  or (h.target_type = 'comment' and not exists (select 1 from public.comments p where p.id = h.target_id))
  or (h.target_type = 'show'    and not exists (select 1 from public.shows p    where p.id = h.target_id));

-- 2. Functions a signed-out caller could reach and had no business reaching.
--
-- Each of these already refuses without a signed-in user, or is a trigger
-- function that is never called directly, so nothing was exposed. Closing
-- them is so that stays true without anyone having to check.
--
-- Trigger functions keep firing: the right to run one is checked when the
-- trigger is created, not each time it fires.
--
-- is_admin() and can_see_profile() are left open on purpose. Row security
-- policies call them, and a policy runs as whoever is reading, including a
-- signed-out visitor on a shared post or profile.

revoke all on function public.create_comment(uuid, text, uuid, uuid, text) from public, anon;
revoke all on function public.create_shot_comment(uuid, text, uuid, uuid, text) from public, anon;
revoke all on function public.top_share_targets(integer) from public, anon;
grant execute on function public.create_comment(uuid, text, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.create_shot_comment(uuid, text, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.top_share_targets(integer) to authenticated, service_role;

revoke all on function public.clean_rehype_via() from public, anon, authenticated;
revoke all on function public.notify_back_after() from public, anon, authenticated;
revoke all on function public.notify_spotlight_page() from public, anon, authenticated;
revoke all on function public.notify_show_posted() from public, anon, authenticated;
revoke all on function public.notify_hype_milestone() from public, anon, authenticated;
revoke all on function public.unsave_leaves_folders() from public, anon, authenticated;
revoke all on function public.handle_shot_repost_insert() from public, anon, authenticated;
revoke all on function public.handle_shot_repost_delete() from public, anon, authenticated;
