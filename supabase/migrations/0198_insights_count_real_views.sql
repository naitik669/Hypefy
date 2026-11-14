-- Insights was under-reporting views by about eighteen times.
--
-- Two different things have been counting views, and the screen read the
-- wrong one.
--
--   posts.view_count   bumped by increment_post_view, which is called from
--                      the permalink and the profile modal only. NOT from
--                      the home feed, which is where people actually look
--                      at posts.
--   post_views         one row per (post, viewer, day), written by
--                      FeedImpression on a real 900ms dwell. The honest one.
--
-- Measured in production the day this was written: sum(view_count) across
-- every post was 112, while post_views held 2,087 rows. Two months of
-- divergence.
--
-- capture_creator_daily_stats then snapshotted sum(view_count) nightly, so
-- all 746 rows of creator_daily_stats.views carry the same wrong number.
-- They are rewritten below rather than preserved: there is nothing in them
-- worth keeping, and post_views.viewed_on reaches back to 3 Sep, so real
-- history can simply be recomputed.
--
-- ── a change of meaning, stated plainly ──────────────────────────────────
--
-- creator_daily_stats.views used to be "the cumulative counter, as it stood
-- that night". It now means "views on that day". A cumulative number can
-- only be drawn as an ever-rising line that says nothing; a per-day number
-- is what a chart is for. followers keeps its old meaning — a total as it
-- stood that day — because for followers that IS the interesting shape.
--
-- Shots are included everywhere here. shot_views has existed since 0132 and
-- nothing has ever read it; Insights showed posts only, while the chart
-- beside the totals already counted shot hypes through get_creator_timeseries.
-- The screen disagreed with itself.

-- ── per-item stats, author only ──────────────────────────────────────────
--
-- Pattern C, as show_slider_voters (0188): security definer, the author gate
-- in the WHERE rather than as a filter applied afterwards, so somebody
-- else's id returns no rows instead of an error.
--
-- views  = impressions, every row
-- reach  = distinct people, since post_views is unique per viewer per DAY
--          and the same person on three days is three rows
create or replace function public.creator_item_stats(p_limit int default 200)
returns table (
  kind text,
  id uuid,
  caption text,
  cover text,
  created_at timestamptz,
  views bigint,
  reach bigint,
  hypes int,
  comments int,
  saves int
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (select (select auth.uid()) as uid)
  (
    select
      'post'::text,
      p.id,
      p.caption,
      coalesce(p.image_url, p.image_urls[1]),
      p.created_at,
      (select count(*) from public.post_views v where v.post_id = p.id),
      (select count(distinct v.viewer_id) from public.post_views v where v.post_id = p.id),
      p.hype_count, p.comment_count, p.save_count
    from public.posts p, me
    where p.user_id = me.uid and p.removed_at is null
  )
  union all
  (
    select
      'shot'::text,
      s.id,
      s.caption,
      coalesce(s.poster_url, s.media_url),
      s.created_at,
      (select count(*) from public.shot_views v where v.shot_id = s.id),
      (select count(distinct v.viewer_id) from public.shot_views v where v.shot_id = s.id),
      s.hype_count, s.comment_count, s.save_count
    from public.shots s, me
    where s.user_id = me.uid and s.removed_at is null
  )
  order by created_at desc
  limit greatest(1, least(p_limit, 500));
$$;

revoke all on function public.creator_item_stats(int) from public, anon;
grant execute on function public.creator_item_stats(int) to authenticated;

-- ── totals, author only ──────────────────────────────────────────────────
--
-- Separate from the per-item list rather than summed from it in the client:
-- the list is capped, and a total computed from a capped list is a total
-- that silently goes wrong the day somebody passes 500 posts.
create or replace function public.creator_totals()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (select (select auth.uid()) as uid),
  pv as (
    select count(*) as views, count(distinct v.viewer_id) as reach
    from public.post_views v join public.posts p on p.id = v.post_id, me
    where p.user_id = me.uid and p.removed_at is null
  ),
  sv as (
    select count(*) as views, count(distinct v.viewer_id) as reach
    from public.shot_views v join public.shots s on s.id = v.shot_id, me
    where s.user_id = me.uid and s.removed_at is null
  ),
  eng as (
    select
      coalesce(sum(p.hype_count),0) as hypes,
      coalesce(sum(p.comment_count),0) as comments,
      coalesce(sum(p.save_count),0) as saves
    from public.posts p, me where p.user_id = me.uid and p.removed_at is null
  ),
  eng_s as (
    select
      coalesce(sum(s.hype_count),0) as hypes,
      coalesce(sum(s.comment_count),0) as comments,
      coalesce(sum(s.save_count),0) as saves
    from public.shots s, me where s.user_id = me.uid and s.removed_at is null
  )
  select jsonb_build_object(
    'views',    (select views from pv) + (select views from sv),
    'reach',    (select reach from pv) + (select reach from sv),
    'hypes',    (select hypes from eng) + (select hypes from eng_s),
    'comments', (select comments from eng) + (select comments from eng_s),
    'saves',    (select saves from eng) + (select saves from eng_s)
  );
$$;

revoke all on function public.creator_totals() from public, anon;
grant execute on function public.creator_totals() to authenticated;

-- ── the nightly rollup counts the right thing ────────────────────────────
--
-- Two days each run, not one. The job fires at 00:10, so "today" is ten
-- minutes old and almost empty; yesterday is the day that has just finished
-- and wants finalising. Writing both means yesterday lands complete and
-- today exists as a partial figure that the next run corrects.
create or replace function public.capture_creator_daily_stats()
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.creator_daily_stats (user_id, day, views, followers)
  select
    u.user_id,
    d.day,
    (
      (select count(*) from public.post_views v
         join public.posts p on p.id = v.post_id
        where p.user_id = u.user_id and p.removed_at is null and v.viewed_on = d.day)
      +
      (select count(*) from public.shot_views v
         join public.shots s on s.id = v.shot_id
        where s.user_id = u.user_id and s.removed_at is null and v.viewed_on = d.day)
    )::int,
    (select count(*) from public.follows f where f.following_id = u.user_id)::int
  -- Only people who have actually posted. Cross-joining every profile by
  -- every day writes a row of zeroes for everyone who has never posted.
  from (
    select user_id from public.posts where removed_at is null
    union
    select user_id from public.shots where removed_at is null
  ) u
  cross join (select current_date as day union all select current_date - 1) d
  on conflict (user_id, day) do update
    set views = excluded.views,
        followers = excluded.followers,
        captured_at = now();
$$;

revoke all on function public.capture_creator_daily_stats() from public, anon, authenticated;

-- ── rewrite the history ──────────────────────────────────────────────────
--
-- Not reversible, and deliberately so: every existing views figure is the
-- broken counter. followers is left alone on days we cannot recompute it —
-- there is no follow history to recompute it FROM, only follows.created_at,
-- which is used below to reconstruct the count as it stood each day.
insert into public.creator_daily_stats (user_id, day, views, followers)
select
  u.user_id,
  d.day,
  (
    (select count(*) from public.post_views v
       join public.posts p on p.id = v.post_id
      where p.user_id = u.user_id and v.viewed_on = d.day)
    +
    (select count(*) from public.shot_views v
       join public.shots s on s.id = v.shot_id
      where s.user_id = u.user_id and v.viewed_on = d.day)
  )::int,
  (select count(*) from public.follows f
    where f.following_id = u.user_id and f.created_at::date <= d.day)::int
-- Only people who have actually posted. Cross-joining every profile by
  -- every day writes a row of zeroes for everyone who has never posted.
  from (
    select user_id from public.posts where removed_at is null
    union
    select user_id from public.shots where removed_at is null
  ) u
cross join (
  select generate_series(
    least(
      coalesce((select min(viewed_on) from public.post_views), current_date),
      coalesce((select min(viewed_on) from public.shot_views), current_date)
    ),
    current_date,
    interval '1 day'
  )::date as day
) d
on conflict (user_id, day) do update
  set views = excluded.views,
      followers = excluded.followers,
      captured_at = now();
