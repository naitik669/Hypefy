-- A SECURITY DEFINER function bypasses row-level security, so the removed_at
-- predicate 0055 added to the read policies does nothing inside one. Every
-- function here reads posts, shots or comments directly, which means a taken-
-- down post would have kept feeding Trending, personalisation and the author's
-- own analytics after it vanished from the feed.
--
-- Trending is the one that gets noticed publicly: removing a post for a slur in
-- its hashtags, and then watching that hashtag stay on the Discover page, is
-- the whole moderation system failing in the most visible place it has.
--
-- Each function is otherwise unchanged; the only edit is the filter.

create or replace function public.get_trending_tags(p_limit integer default 16)
returns table(tag text, recent integer, score numeric)
language sql stable security definer set search_path to 'public'
as $function$
  with recent as (
    select lower(t) as tag, count(*)::int as c
    from public.posts p, unnest(coalesce(p.hashtags, array[]::text[])) as t
    where p.created_at >= now() - interval '24 hours'
      and p.removed_at is null
    group by lower(t)
  ),
  base as (
    select lower(t) as tag, count(*)::int as c
    from public.posts p, unnest(coalesce(p.hashtags, array[]::text[])) as t
    where p.created_at >= now() - interval '96 hours'
      and p.created_at < now() - interval '24 hours'
      and p.removed_at is null
    group by lower(t)
  )
  select r.tag, r.c as recent,
    (r.c::numeric - coalesce(b.c, 0)::numeric / 3.0)::numeric as score
  from recent r
  left join base b on b.tag = r.tag
  order by score desc, r.c desc
  limit p_limit;
$function$;

-- A removed post should not keep earning its author a posting streak or count
-- toward their totals.
create or replace function public.get_user_streak(p_user_id uuid)
returns table(current_streak integer, longest_streak integer, total_posts integer, hypes_received integer)
language sql stable security definer set search_path to 'public'
as $function$
  with days as (
    select distinct created_at::date as d
    from public.posts
    where user_id = p_user_id and removed_at is null
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
    (select count(*)::int from public.posts
      where user_id = p_user_id and removed_at is null) as total_posts,
    (select coalesce(sum(hype_count), 0)::int from public.posts
      where user_id = p_user_id and removed_at is null) as hypes_received;
$function$;

-- Personalisation. The joins are LEFT, so putting the filter in the join
-- condition nulls the author and the existing `author_id is not null` guard
-- drops the row — no change to the shape of the query.
create or replace function public.get_affinity(p_lookback_days integer default 60)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with me as (select auth.uid() as uid),
  cut as (select now() - (p_lookback_days || ' days')::interval as ts),
  author_src as (
    select coalesce(p.user_id, s.user_id) as author_id, 3.0 as w, h.created_at
    from public.hypes h
    left join public.posts p on h.target_type='post' and p.id=h.target_id and p.removed_at is null
    left join public.shots s on h.target_type='shot' and s.id=h.target_id and s.removed_at is null
    where h.user_id=(select uid from me) and h.created_at >= (select ts from cut)
    union all
    select coalesce(p.user_id, s.user_id), 4.0, c.created_at
    from public.comments c
    left join public.posts p on p.id=c.post_id and p.removed_at is null
    left join public.shots s on s.id=c.shot_id and s.removed_at is null
    where c.user_id=(select uid from me) and c.created_at >= (select ts from cut)
      and c.removed_at is null
    union all
    select p.user_id, 2.0, sp.created_at
    from public.saved_posts sp join public.posts p on p.id=sp.post_id and p.removed_at is null
    where sp.user_id=(select uid from me) and sp.created_at >= (select ts from cut)
    union all
    select s.user_id, 2.0, ss.created_at
    from public.saved_shots ss join public.shots s on s.id=ss.shot_id and s.removed_at is null
    where ss.user_id=(select uid from me) and ss.created_at >= (select ts from cut)
    union all
    select p.user_id, 3.0, r.created_at
    from public.reposts r join public.posts p on p.id=r.post_id and p.removed_at is null
    where r.user_id=(select uid from me) and r.created_at >= (select ts from cut)
    union all
    select cm2.user_id, 5.0, now()
    from public.conversation_members cm1
    join public.conversation_members cm2
      on cm2.conversation_id = cm1.conversation_id and cm2.user_id <> cm1.user_id
    where cm1.user_id=(select uid from me)
  ),
  author_weights as (
    select author_id,
      sum(w * greatest(0.3, 1 - (extract(epoch from (now()-created_at))/86400.0)/p_lookback_days)) as weight
    from author_src
    where author_id is not null and author_id <> (select uid from me)
    group by author_id
  ),
  tag_src as (
    select p.hashtags, h.created_at
    from public.hypes h
    join public.posts p on h.target_type='post' and p.id=h.target_id and p.removed_at is null
    where h.user_id=(select uid from me) and h.created_at >= (select ts from cut)
    union all
    select p.hashtags, sp.created_at
    from public.saved_posts sp join public.posts p on p.id=sp.post_id and p.removed_at is null
    where sp.user_id=(select uid from me) and sp.created_at >= (select ts from cut)
    union all
    select p.hashtags, c.created_at
    from public.comments c join public.posts p on p.id=c.post_id and p.removed_at is null
    where c.user_id=(select uid from me) and c.created_at >= (select ts from cut)
  ),
  tag_weights as (
    select lower(tag) as tag,
      sum(greatest(0.3, 1 - (extract(epoch from (now()-created_at))/86400.0)/p_lookback_days)) as weight
    from tag_src, unnest(coalesce(hashtags, array[]::text[])) as tag
    group by lower(tag)
  )
  select jsonb_build_object(
    'authors', coalesce((select jsonb_object_agg(author_id::text, round(weight::numeric,2)) from author_weights), '{}'::jsonb),
    'tags', coalesce((select jsonb_object_agg(tag, round(weight::numeric,2)) from tag_weights), '{}'::jsonb)
  );
$function$;

create or replace function public.get_creator_timeseries(p_days integer default 30)
returns table(day date, hypes integer, comments integer, saves integer, follows integer)
language sql stable security definer set search_path to 'public'
as $function$
  with days as (
    select generate_series(current_date - (p_days - 1), current_date, interval '1 day')::date as day
  ),
  mine as (
    select id from public.posts where user_id = (select auth.uid()) and removed_at is null
  ),
  my_shots as (
    select id from public.shots where user_id = (select auth.uid()) and removed_at is null
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
    where deleted_at is null and removed_at is null
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
    from public.follows where following_id = (select auth.uid()) group by 1
  )
  select d.day, coalesce(h.n, 0), coalesce(c.n, 0), coalesce(s.n, 0), coalesce(f.n, 0)
  from days d
  left join h on h.day = d.day
  left join c on c.day = d.day
  left join s on s.day = d.day
  left join f on f.day = d.day
  order by d.day;
$function$;

create or replace function public.capture_creator_daily_stats()
returns void
language sql security definer set search_path to 'public'
as $function$
  insert into public.creator_daily_stats (user_id, day, views, followers)
  select p.user_id, current_date,
         coalesce(sum(p.view_count), 0)::int,
         (select count(*) from public.follows f where f.following_id = p.user_id)::int
  from public.posts p
  where p.removed_at is null
  group by p.user_id
  on conflict (user_id, day) do update
    set views = excluded.views, followers = excluded.followers, captured_at = now();
$function$;
