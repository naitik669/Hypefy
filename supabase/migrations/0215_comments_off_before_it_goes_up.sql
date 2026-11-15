-- Comments can be turned off before a post goes up, not only after.
--
-- set_comments_off (0131) has always existed, and PostActionsSheet has
-- always been the only way to reach it — so the only way to post something
-- with comments off was to post it with comments on and then turn them off.
-- Between those two taps the post is live and open, which for the one kind
-- of post somebody most wants closed is exactly the wrong window.
--
-- posts.comments_off and shots.comments_off are SELECT-only for
-- authenticated, deliberately: only the definer function may change them.
-- That stays true. An immediate post calls set_comments_off straight after
-- its insert, which needs nothing from this migration.
--
-- A SCHEDULED one does, because its row in posts does not exist yet and the
-- choice has to survive until pg_cron makes it. Without this a post
-- scheduled with comments off would quietly come up open, which is worse
-- than not offering the option while scheduling.
--
-- The grants on both scheduled tables are table-level, so a new column is
-- covered by them already; the publishers are security definer and may
-- write posts.comments_off whatever authenticated can do.

alter table public.scheduled_posts
  add column if not exists comments_off boolean not null default false;

alter table public.scheduled_shots
  add column if not exists comments_off boolean not null default false;

-- Restated in full, as 0209 did: the column list is the whole function.
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
    returning user_id, caption, body, image_url, image_urls, hashtags, mentions,
              track, poll, aspect_ratio, media, comments_off
  ), ins as (
    insert into public.posts (user_id, caption, body, image_url, image_urls, hashtags,
                              mentions, track, poll, aspect_ratio, media, comments_off,
                              created_at)
    select user_id, caption, body, image_url, image_urls, hashtags, mentions,
           track, poll, aspect_ratio, media, comments_off, now()
    from due
    returning 1
  )
  select count(*) into v_count from ins;
  return coalesce(v_count, 0);
end;
$function$;

create or replace function public.publish_due_scheduled_shots()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_count int;
begin
  with due as (
    delete from public.scheduled_shots
    where scheduled_at <= now()
    returning user_id, media_url, poster_url, caption, hashtags, mentions,
              track, duration_secs, trim_start, trim_end, audience, comments_off
  ), ins as (
    insert into public.shots (user_id, media_url, poster_url, caption, hashtags, mentions,
                              track, duration_secs, trim_start, trim_end, audience,
                              comments_off, created_at)
    select user_id, media_url, poster_url, caption, hashtags, mentions,
           track, duration_secs, trim_start, trim_end, audience, comments_off, now()
    from due
    returning 1
  )
  select count(*) into v_count from ins;
  return coalesce(v_count, 0);
end;
$function$;
