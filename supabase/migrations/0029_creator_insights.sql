-- Creator insights were totals-only. Hypes, comments, saves and follows all
-- carry created_at, so those chart retroactively from an RPC. Views do not:
-- posts.view_count is a bare counter with no history, so a nightly rollup
-- captures it going forward (chart starts from the day this ships).

create table if not exists public.creator_daily_stats (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  views int not null default 0,
  followers int not null default 0,
  captured_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.creator_daily_stats enable row level security;

drop policy if exists "creator_daily_stats: own read" on public.creator_daily_stats;
create policy "creator_daily_stats: own read" on public.creator_daily_stats
  for select using ((select auth.uid()) = user_id);

-- Nightly snapshot of each creator's cumulative view count + follower count.
-- Only touches users who have posted, and is idempotent per (user_id, day).
create or replace function public.capture_creator_daily_stats()
returns void
language sql security definer set search_path = public as $$
  insert into public.creator_daily_stats (user_id, day, views, followers)
  select p.user_id,
         current_date,
         coalesce(sum(p.view_count), 0)::int,
         (select count(*) from public.follows f where f.following_id = p.user_id)::int
  from public.posts p
  group by p.user_id
  on conflict (user_id, day) do update
    set views = excluded.views,
        followers = excluded.followers,
        captured_at = now();
$$;

-- Cron-only: never callable from a client.
revoke all on function public.capture_creator_daily_stats() from public, anon, authenticated;

-- Per-day engagement for the caller's own content over the last N days.
-- Retroactive: derived entirely from existing created_at timestamps.
create or replace function public.get_creator_timeseries(p_days int default 30)
returns table (day date, hypes int, comments int, saves int, follows int)
language sql stable security definer set search_path = public as $$
  with days as (
    select generate_series(current_date - (p_days - 1), current_date, interval '1 day')::date as day
  ),
  mine as (
    select id from public.posts where user_id = (select auth.uid())
  ),
  my_shots as (
    select id from public.shots where user_id = (select auth.uid())
  ),
  h as (
    select created_at::date as day, count(*)::int as n
    from public.hypes
    where (target_type = 'post' and target_id in (select id from mine))
       or (target_type = 'shot' and target_id in (select id from my_shots))
    group by 1
  ),
  c as (
    select created_at::date as day, count(*)::int as n
    from public.comments
    where deleted_at is null
      and (post_id in (select id from mine) or shot_id in (select id from my_shots))
    group by 1
  ),
  s as (
    select day, sum(n)::int as n from (
      select created_at::date as day, count(*)::int as n
      from public.saved_posts where post_id in (select id from mine) group by 1
      union all
      select created_at::date as day, count(*)::int as n
      from public.saved_shots where shot_id in (select id from my_shots) group by 1
    ) u group by day
  ),
  f as (
    select created_at::date as day, count(*)::int as n
    from public.follows
    where following_id = (select auth.uid())
    group by 1
  )
  select d.day,
         coalesce(h.n, 0), coalesce(c.n, 0),
         coalesce(s.n, 0), coalesce(f.n, 0)
  from days d
  left join h on h.day = d.day
  left join c on c.day = d.day
  left join s on s.day = d.day
  left join f on f.day = d.day
  order by d.day;
$$;

revoke all on function public.get_creator_timeseries(int) from public, anon;
grant execute on function public.get_creator_timeseries(int) to authenticated;

-- Nightly at 00:10 UTC, alongside the existing publish-scheduled-posts job.
-- select cron.schedule('capture-creator-daily-stats', '10 0 * * *',
--                      'select public.capture_creator_daily_stats();');
