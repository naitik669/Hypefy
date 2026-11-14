-- Insights shows how far through a Shot people got.
--
-- 0202 started recording it; this is what makes it visible. Without this
-- the data accumulates and no one can see it, which is the state
-- shot_views was in for the whole of its existence — written since 0132,
-- read by nothing until 0198.
--
-- avg_completion is null for a post, not zero. A post has no completion to
-- have, and zero would draw as "nobody finished it", which is a different
-- and false claim. The column is nullable so the screen can tell the
-- difference between "nought per cent" and "not a question about this".
--
-- The return type gains a column, so this is a drop and recreate rather
-- than a create-or-replace: Postgres will not change a function's output
-- columns in place. Both statements are in one migration so there is no
-- moment where the function is missing.

drop function if exists public.creator_item_stats(int);

create function public.creator_item_stats(p_limit int default 200)
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
  saves int,
  avg_completion smallint
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
      p.hype_count, p.comment_count, p.save_count,
      null::smallint
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
      s.hype_count, s.comment_count, s.save_count,
      -- Null rather than zero when nobody has watched it yet, for the same
      -- reason a post's is null: no watchers is not nought per cent.
      (select round(avg(w.max_completion))::smallint
         from public.shot_watch_stats w where w.shot_id = s.id)
    from public.shots s, me
    where s.user_id = me.uid and s.removed_at is null
  )
  order by created_at desc
  limit greatest(1, least(p_limit, 500));
$$;

revoke all on function public.creator_item_stats(int) from public, anon;
grant execute on function public.creator_item_stats(int) to authenticated;
