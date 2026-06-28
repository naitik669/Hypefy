-- Algorithm v2: interaction affinity, friendly-circle people suggestions,
-- followed hashtags, and velocity-based trending. All heavy signals computed
-- in Postgres; the app blends the final ranking in JS.

-- ── Followed hashtags ────────────────────────────────────────────────────
create table if not exists public.hashtag_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, tag)
);
alter table public.hashtag_follows enable row level security;
create policy hashtag_follows_owner_all on public.hashtag_follows
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.toggle_hashtag_follow(p_tag text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_tag text := lower(regexp_replace(coalesce(p_tag,''), '^#', ''));
begin
  if v_tag = '' then raise exception 'Empty tag'; end if;
  delete from public.hashtag_follows where user_id = auth.uid() and tag = v_tag;
  if found then return false; end if;
  insert into public.hashtag_follows (user_id, tag) values (auth.uid(), v_tag) on conflict do nothing;
  return true;
end; $$;
revoke execute on function public.toggle_hashtag_follow(text) from anon;
grant execute on function public.toggle_hashtag_follow(text) to authenticated;

-- ── Velocity trending tags ───────────────────────────────────────────────
create or replace function public.get_trending_tags(p_limit int default 16)
returns table(tag text, recent int, score numeric)
language sql stable security definer set search_path = public as $$
  with recent as (
    select lower(t) as tag, count(*)::int as c
    from public.posts p, unnest(coalesce(p.hashtags, array[]::text[])) as t
    where p.created_at >= now() - interval '24 hours'
    group by lower(t)
  ),
  base as (
    select lower(t) as tag, count(*)::int as c
    from public.posts p, unnest(coalesce(p.hashtags, array[]::text[])) as t
    where p.created_at >= now() - interval '96 hours' and p.created_at < now() - interval '24 hours'
    group by lower(t)
  )
  select r.tag, r.c as recent, (r.c::numeric - coalesce(b.c, 0)::numeric / 3.0)::numeric as score
  from recent r left join base b on b.tag = r.tag
  order by score desc, r.c desc
  limit p_limit;
$$;
revoke execute on function public.get_trending_tags(int) from anon;
grant execute on function public.get_trending_tags(int) to authenticated;

-- ── Interaction affinity (authors + tags the caller engages with) ────────
create or replace function public.get_affinity(p_lookback_days int default 60)
returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  cut as (select now() - (p_lookback_days || ' days')::interval as ts),
  author_src as (
    select coalesce(p.user_id, s.user_id) as author_id, 3.0 as w, h.created_at
      from public.hypes h
      left join public.posts p on h.target_type='post' and p.id=h.target_id
      left join public.shots s on h.target_type='shot' and s.id=h.target_id
     where h.user_id=(select uid from me) and h.created_at >= (select ts from cut)
    union all
    select coalesce(p.user_id, s.user_id), 4.0, c.created_at
      from public.comments c
      left join public.posts p on p.id=c.post_id
      left join public.shots s on s.id=c.shot_id
     where c.user_id=(select uid from me) and c.created_at >= (select ts from cut)
    union all
    select p.user_id, 2.0, sp.created_at from public.saved_posts sp join public.posts p on p.id=sp.post_id
     where sp.user_id=(select uid from me) and sp.created_at >= (select ts from cut)
    union all
    select s.user_id, 2.0, ss.created_at from public.saved_shots ss join public.shots s on s.id=ss.shot_id
     where ss.user_id=(select uid from me) and ss.created_at >= (select ts from cut)
    union all
    select p.user_id, 3.0, r.created_at from public.reposts r join public.posts p on p.id=r.post_id
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
    select p.hashtags, h.created_at from public.hypes h join public.posts p on h.target_type='post' and p.id=h.target_id
      where h.user_id=(select uid from me) and h.created_at >= (select ts from cut)
    union all
    select p.hashtags, sp.created_at from public.saved_posts sp join public.posts p on p.id=sp.post_id
      where sp.user_id=(select uid from me) and sp.created_at >= (select ts from cut)
    union all
    select p.hashtags, c.created_at from public.comments c join public.posts p on p.id=c.post_id
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
    'tags',    coalesce((select jsonb_object_agg(tag, round(weight::numeric,2)) from tag_weights), '{}'::jsonb)
  );
$$;
revoke execute on function public.get_affinity(int) from anon;
grant execute on function public.get_affinity(int) to authenticated;

-- ── Friendly-circle people suggestions ───────────────────────────────────
create or replace function public.get_suggested_people(p_limit int default 12)
returns table(
  id uuid, display_name text, username text, avatar_hue int,
  avatar_url text, bio text, profile_tags text[], is_verified boolean, score numeric
)
language sql volatile security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  my_prof as (select interests, profile_tags from public.profiles where id = (select uid from me)),
  my_tags as (
    select array(select distinct lower(x) from (
      select unnest(coalesce((select interests from my_prof), array[]::text[])) as x
      union all
      select unnest(coalesce((select profile_tags from my_prof), array[]::text[]))
    ) z) as tags
  ),
  my_follows as (select following_id as id from public.follows where follower_id = (select uid from me)),
  blocked as (
    select blocked_id as id from public.blocked_users where blocker_id = (select uid from me)
    union
    select blocker_id from public.blocked_users where blocked_id = (select uid from me)
  ),
  fof as (
    select f2.following_id as id, count(*)::numeric as fof_count
      from public.follows f1
      join public.follows f2 on f2.follower_id = f1.following_id
     where f1.follower_id = (select uid from me)
     group by f2.following_id
  ),
  followers_of_me as (select follower_id as id from public.follows where following_id = (select uid from me)),
  follower_counts as (select following_id as id, count(*)::numeric as c from public.follows group by following_id),
  candidates as (
    select id from fof
    union select id from followers_of_me
    union select id from public.profiles
      where profile_completed and id <> (select uid from me) and profile_tags && (select tags from my_tags)
  )
  select pr.id, pr.display_name, pr.username, pr.avatar_hue, pr.avatar_url, pr.bio, pr.profile_tags, pr.is_verified,
    (
        coalesce(fof.fof_count, 0) * 3.0
      + (case when fm.id is not null then 4.0 else 0 end)
      + coalesce(cardinality(shared.tags), 0) * 2.0
      + (case when pr.last_seen_at >= now() - interval '7 days' then 1.5 else 0 end)
      - log(greatest(coalesce(fc.c, 0), 1) + 1) * 1.2
      + random() * 0.5
    )::numeric as score
  from candidates cand
  join public.profiles pr on pr.id = cand.id
  left join fof on fof.id = pr.id
  left join followers_of_me fm on fm.id = pr.id
  left join follower_counts fc on fc.id = pr.id
  cross join lateral (
    select array(
      select unnest(coalesce(pr.profile_tags, array[]::text[]))
      intersect
      select unnest((select tags from my_tags))
    ) as tags
  ) shared
  where pr.profile_completed
    and pr.id <> (select uid from me)
    and pr.id not in (select id from my_follows)
    and pr.id not in (select id from blocked)
  order by score desc
  limit p_limit;
$$;
revoke execute on function public.get_suggested_people(int) from anon;
grant execute on function public.get_suggested_people(int) to authenticated;
