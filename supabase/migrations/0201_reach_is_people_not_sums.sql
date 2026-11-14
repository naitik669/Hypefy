-- Two corrections to creator_totals, which 0198 shipped an hour earlier.
--
-- ── reach was adding two counts of people ───────────────────────────────
--
-- It computed distinct viewers of your posts, distinct viewers of your
-- Shots, and added them. Anybody who watched a Shot AND saw a post was
-- counted twice, so "people reached" was not a number of people.
--
-- Measured before changing it: 4 of the authors with any views are
-- overstated today, the worst by 6 people. Not a rounding matter on a
-- number whose entire job is to be smaller and truer than views.
--
-- Distinct across both now, by union rather than by sum. views stays a sum
-- because views genuinely are additive — the same person on three days is
-- three views and one person, which is exactly the distinction the two
-- numbers exist to draw.
--
-- ── and the split it was missing ────────────────────────────────────────
--
-- Of the people who saw it, how many already follow you. This is the one
-- number that answers "is this leaving my bubble", which for somebody with
-- forty followers is the only question about reach worth asking: 300 views
-- that never left your followers is a different week from 300 that did.
--
-- followers + new always equals reach, because both are counted off the
-- same distinct set rather than queried separately.

create or replace function public.creator_totals()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (select (select auth.uid()) as uid),
  -- Every distinct person who saw anything of mine, once.
  people as (
    select distinct v.viewer_id
      from public.post_views v
      join public.posts p on p.id = v.post_id, me
     where p.user_id = me.uid and p.removed_at is null
    union
    select distinct v.viewer_id
      from public.shot_views v
      join public.shots s on s.id = v.shot_id, me
     where s.user_id = me.uid and s.removed_at is null
  ),
  split as (
    select
      count(*) as reach,
      count(*) filter (
        where exists (
          select 1 from public.follows f, me
           where f.follower_id = people.viewer_id and f.following_id = me.uid
        )
      ) as from_followers
    from people
  ),
  -- Impressions. Additive on purpose.
  views as (
    select
      (select count(*) from public.post_views v
         join public.posts p on p.id = v.post_id, me
        where p.user_id = me.uid and p.removed_at is null)
      +
      (select count(*) from public.shot_views v
         join public.shots s on s.id = v.shot_id, me
        where s.user_id = me.uid and s.removed_at is null) as total
  ),
  eng as (
    select
      (select coalesce(sum(p.hype_count),0) from public.posts p, me
        where p.user_id = me.uid and p.removed_at is null)
      + (select coalesce(sum(s.hype_count),0) from public.shots s, me
        where s.user_id = me.uid and s.removed_at is null) as hypes,
      (select coalesce(sum(p.comment_count),0) from public.posts p, me
        where p.user_id = me.uid and p.removed_at is null)
      + (select coalesce(sum(s.comment_count),0) from public.shots s, me
        where s.user_id = me.uid and s.removed_at is null) as comments,
      (select coalesce(sum(p.save_count),0) from public.posts p, me
        where p.user_id = me.uid and p.removed_at is null)
      + (select coalesce(sum(s.save_count),0) from public.shots s, me
        where s.user_id = me.uid and s.removed_at is null) as saves
  )
  select jsonb_build_object(
    'views',          (select total from views),
    'reach',          (select reach from split),
    'reach_following',(select from_followers from split),
    'reach_new',      (select reach - from_followers from split),
    'hypes',          (select hypes from eng),
    'comments',       (select comments from eng),
    'saves',          (select saves from eng)
  );
$$;

revoke all on function public.creator_totals() from public, anon;
grant execute on function public.creator_totals() to authenticated;
