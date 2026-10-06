-- Favourites and Hypers were two private lists of people with nearly the same
-- purpose: one feed tab each, one page each, two entries in the same menu.
-- They are one list now, and it is Hypers.
--
-- Everyone on a Favourites list is added to that person's Hypers, keeping the
-- date they were added. Someone already on both stays once.
--
-- public.favorites is left exactly as it is. Nothing reads it any more, and
-- keeping it means this can be undone by pointing the app back at it.

insert into public.close_friends (user_id, friend_id, created_at)
select f.user_id, f.friend_id, f.created_at
  from public.favorites f
on conflict (user_id, friend_id) do nothing;

comment on table public.favorites is
  'Retired in 0111: merged into close_friends (Hypers). Kept, unread, so the merge can be undone.';
