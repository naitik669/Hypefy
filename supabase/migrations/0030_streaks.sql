-- Posting streaks + Hype milestones. Derived on read from posts.created_at
-- rather than stored in a table: nothing to drift, no cron to run, and the
-- number is always correct.
--
-- Classic gaps-and-islands: subtracting a row_number from each distinct
-- posting date makes every consecutive run share a constant, so runs can be
-- grouped and counted. The current streak is the run ending today or
-- yesterday, so a streak survives until you miss a full day.
create or replace function public.get_user_streak(p_user_id uuid)
returns table (current_streak int, longest_streak int, total_posts int, hypes_received int)
language sql stable security definer set search_path = public as $$
  with days as (
    select distinct created_at::date as d
    from public.posts
    where user_id = p_user_id
  ),
  grouped as (
    select d, d - (row_number() over (order by d))::int as grp
    from days
  ),
  runs as (
    select grp, count(*)::int as len, max(d) as last_day
    from grouped
    group by grp
  )
  select
    coalesce((
      select len from runs
      where last_day >= current_date - 1
      order by last_day desc limit 1
    ), 0) as current_streak,
    coalesce((select max(len) from runs), 0) as longest_streak,
    (select count(*)::int from public.posts where user_id = p_user_id) as total_posts,
    (select coalesce(sum(hype_count), 0)::int from public.posts where user_id = p_user_id) as hypes_received;
$$;

revoke all on function public.get_user_streak(uuid) from public, anon;
grant execute on function public.get_user_streak(uuid) to authenticated;
