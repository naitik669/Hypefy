-- A scheduled post can carry a clip too.
--
-- 0195 added posts.media and stopped there, which was right at the time:
-- nothing wrote it. Now the composer does, and scheduled_posts is a
-- separate table that publish_due_scheduled_posts() copies into posts
-- column by column. A column missing from either the table or that SELECT
-- is a column the scheduled copy silently drops.
--
-- Silently is the problem. You would pick a clip, schedule the post, and
-- get a post an hour later with the clip gone and no error anywhere —
-- 0035 had to add aspect_ratio in both places for exactly this reason, and
-- the function's column list is the kind of thing that only ever goes
-- wrong in one direction.
--
-- Same structural CHECK as posts: an array, bounded in length and size, so
-- a crafted payload cannot make a row that costs anything to read.
-- Meaning is still src/lib/post-media.ts's job and nowhere else.
--
-- scheduled_posts grants at table level (0017), so unlike posts there is no
-- column grant to add here.

alter table public.scheduled_posts
  add column if not exists media jsonb;

alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_media_shape;
alter table public.scheduled_posts
  add constraint scheduled_posts_media_shape check (
    media is null
    or (
      jsonb_typeof(media) = 'array'
      and jsonb_array_length(media) <= 10
      and pg_column_size(media) <= 8192
    )
  );

create or replace function public.publish_due_scheduled_posts()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_count int;
begin
  with due as (
    delete from public.scheduled_posts
    where scheduled_at <= now()
    returning user_id, caption, body, image_url, image_urls, hashtags, mentions, track, poll, aspect_ratio, media
  ), ins as (
    insert into public.posts (user_id, caption, body, image_url, image_urls, hashtags, mentions, track, poll, aspect_ratio, media, created_at)
    select user_id, caption, body, image_url, image_urls, hashtags, mentions, track, poll, aspect_ratio, media, now()
    from due
    returning 1
  )
  select count(*) into v_count from ins;
  return coalesce(v_count, 0);
end;
$function$;
