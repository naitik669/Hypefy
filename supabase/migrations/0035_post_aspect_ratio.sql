-- Posts remember the shape they were composed in.
--
-- The composer already lets you pick 1:1 / 3:4 / 4:3 / 16:9 and crops the
-- upload to it, but the feed hardcoded `aspect-square` + `object-cover`
-- (FeedCard.tsx), so a 16:9 post was cropped straight back to a square on
-- render. The chosen shape was collected, applied to the file, and then
-- thrown away by the only screen that mattered.
--
-- Stored as numeric width/height rather than a "16:9" label so the new
-- "Auto" mode has somewhere to put an arbitrary measured ratio.
--
-- Nullable with no backfill: every existing post keeps rendering square,
-- which is exactly how it was composed and how it looks today.
alter table public.posts add column if not exists aspect_ratio numeric;
alter table public.scheduled_posts add column if not exists aspect_ratio numeric;

-- Guard against a shape that would break the feed layout. Anything outside
-- this range is a bad client, not a creative choice.
alter table public.posts drop constraint if exists posts_aspect_ratio_sane;
alter table public.posts add constraint posts_aspect_ratio_sane
  check (aspect_ratio is null or (aspect_ratio >= 0.4 and aspect_ratio <= 3.0));

alter table public.scheduled_posts drop constraint if exists scheduled_posts_aspect_ratio_sane;
alter table public.scheduled_posts add constraint scheduled_posts_aspect_ratio_sane
  check (aspect_ratio is null or (aspect_ratio >= 0.4 and aspect_ratio <= 3.0));

-- The publisher enumerates every column by name, so a new column is invisible
-- to it unless it is added here as well — a scheduled 16:9 post would
-- otherwise publish with a null ratio and render square.
create or replace function public.publish_due_scheduled_posts()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_count int;
begin
  with due as (
    delete from public.scheduled_posts
    where scheduled_at <= now()
    returning user_id, caption, body, image_url, image_urls, hashtags, mentions, track, poll, aspect_ratio
  ), ins as (
    insert into public.posts (user_id, caption, body, image_url, image_urls, hashtags, mentions, track, poll, aspect_ratio, created_at)
    select user_id, caption, body, image_url, image_urls, hashtags, mentions, track, poll, aspect_ratio, now()
    from due
    returning 1
  )
  select count(*) into v_count from ins;
  return coalesce(v_count, 0);
end;
$$;

-- Re-applied because CREATE OR REPLACE resets nothing about grants, but the
-- original migration revoked these and a future reader should see it stays so.
revoke all on function public.publish_due_scheduled_posts() from public, anon, authenticated;
