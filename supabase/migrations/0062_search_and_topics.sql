-- ─────────────────────────────────────────────────────────────────────
-- Search that ranks, and something to look at before you type.
--
-- Search was two `ilike '%term%'` queries ordered by hype_count. Two
-- problems with that, one cosmetic and one not:
--
--   * No ranking. A profile whose username IS the term ranked level with
--     one that merely contains it, and the tie was broken by nothing.
--     Posts were ordered by all-time hype, so the top result for a live
--     topic was reliably the oldest popular post about it.
--   * The term was interpolated into PostgREST's `or=` filter on the
--     client. A comma or a parenthesis in the query — "hey, you" — is
--     filter SYNTAX there, so those searches did not return poor results,
--     they returned the wrong ones or an error.
--
-- Ranking belongs in SQL anyway: you cannot order 20 rows correctly after
-- the database has already chosen which 20 to send.
-- ─────────────────────────────────────────────────────────────────────

-- Both search functions are SECURITY INVOKER (the default) on purpose.
-- They read posts and profiles, so RLS has to keep applying — a definer
-- function here would hand every caller the private accounts and the
-- moderated-away posts that 0045, 0051 and 0055 exist to hide.

create or replace function public.search_people(p_q text, p_limit int default 20)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_hue int,
  avatar_url text,
  bio text,
  is_verified boolean,
  followers int,
  score real
)
language sql
stable
set search_path = public
as $$
  with q as (
    -- Wildcards escaped, not stripped: someone searching "50%" means the
    -- character, and an unescaped _ quietly matches any letter, which is
    -- how a typo'd search comes back with confident nonsense.
    select replace(replace(replace(
             lower(btrim(regexp_replace(coalesce(p_q, ''), '^[@#]', ''))),
             '\', '\\'), '%', '\%'), '_', '\_') as t
  )
  select
    p.id,
    p.display_name,
    p.username,
    p.avatar_hue,
    p.avatar_url,
    p.bio,
    coalesce(p.is_verified, false) as is_verified,
    f.n as followers,
    (
      -- An exact handle is what you meant. A prefix is probably what you
      -- meant. A substring is a guess, and a display-name substring is the
      -- weakest guess of the lot.
      case
        when lower(coalesce(p.username, '')) = q.t then 100
        when lower(coalesce(p.display_name, '')) = q.t then 90
        when lower(coalesce(p.username, '')) like q.t || '%' then 70
        when lower(coalesce(p.display_name, '')) like q.t || '%' then 58
        -- Start of any WORD in the display name: "kush" should find
        -- "Naitik Kushwaha" well above someone with kush mid-word.
        when lower(coalesce(p.display_name, '')) like '% ' || q.t || '%' then 46
        when lower(coalesce(p.username, '')) like '%' || q.t || '%' then 34
        when lower(coalesce(p.display_name, '')) like '%' || q.t || '%' then 30
        else 8
      end
      + case when coalesce(p.is_verified, false) then 6 else 0 end
      -- Followers break ties without ever outranking a better match: the
      -- whole term is worth 20 points at ten thousand followers, less than
      -- the gap between a prefix and a substring.
      + least(f.n, 10000) / 500.0
    )::real as score
  from public.profiles p
  cross join q
  cross join lateral (
    select count(*)::int as n
    from public.follows fo
    where fo.following_id = p.id
  ) f
  where q.t <> ''
    and p.profile_completed = true
    and (
      lower(coalesce(p.username, '')) like '%' || q.t || '%'
      or lower(coalesce(p.display_name, '')) like '%' || q.t || '%'
    )
  order by score desc, f.n desc, p.username
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

comment on function public.search_people(text, int) is
  'Ranked people search. Exact handle > prefix > word start > substring, with verification and follower count as tiebreaks only.';

create or replace function public.search_posts(p_q text, p_limit int default 24)
returns setof public.posts
language sql
stable
set search_path = public
as $$
  with q as (
    select
      btrim(coalesce(p_q, '')) like '#%' as is_tag,
      replace(replace(replace(
        lower(btrim(regexp_replace(coalesce(p_q, ''), '^[@#]', ''))),
        '\', '\\'), '%', '\%'), '_', '\_') as t,
      -- The unescaped form, for the array containment test, which is an
      -- equality check and not a pattern.
      lower(btrim(regexp_replace(coalesce(p_q, ''), '^[@#]', ''))) as raw
  )
  select p.*
  from public.posts p
  cross join q
  where q.t <> ''
    and (
      p.hashtags @> array[q.raw]
      or (
        not q.is_tag
        and (
          lower(coalesce(p.caption, '')) like '%' || q.t || '%'
          or lower(coalesce(p.body, '')) like '%' || q.t || '%'
        )
      )
    )
  order by (
      -- Carrying the tag beats mentioning the word in passing.
      case when p.hashtags @> array[q.raw] then 34 else 0 end
    + case when lower(coalesce(p.caption, '')) like q.t || '%' then 14 else 0 end
      -- Logs, not raw counts: the difference between 0 and 10 hypes says
      -- far more than the difference between 500 and 510, and a linear
      -- term lets one viral post own every query it happens to contain.
    + ln(1 + greatest(coalesce(p.hype_count, 0), 0)) * 5
    + ln(1 + greatest(coalesce(p.comment_count, 0), 0)) * 3
      -- Freshness worth about a day each, for the first three weeks. Pure
      -- hype ordering made search a museum.
    + greatest(0, 21 - extract(epoch from (now() - p.created_at)) / 86400.0)
  ) desc, p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 24), 50));
$$;

comment on function public.search_posts(text, int) is
  'Ranked post search blending tag match, caption prefix, damped engagement and recency. SECURITY INVOKER so RLS still hides private and removed posts.';

-- ─────────────────────────────────────────────────────────────────────
-- Topics to browse before anyone types anything.
--
-- get_trending_tags only looks at the last 24 hours, which on a young app
-- is usually empty — an empty discovery screen is worse than none, so this
-- ranks on all-time volume with the last week weighted heavily, and always
-- has something to show while still moving when a topic takes off.
--
-- Definer, because it aggregates across everyone's posts. That makes the
-- author filter load-bearing rather than decorative: without it this would
-- publish a private account's picture as a topic cover.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.get_topic_cards(p_limit int default 12)
returns table (
  tag text,
  post_count int,
  recent_count int,
  cover_url text,
  last_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with tagged as (
    select
      lower(h.tag_raw) as tag,
      coalesce(p.hype_count, 0) as hype_count,
      p.created_at,
      coalesce(p.image_url, (p.image_urls)[1]) as img
    from public.posts p
    join public.profiles pr on pr.id = p.user_id
    cross join lateral unnest(coalesce(p.hashtags, array[]::text[])) as h(tag_raw)
    where p.removed_at is null
      and coalesce(pr.is_private, false) = false
  ),
  agg as (
    select
      tag,
      count(*)::int as post_count,
      count(*) filter (where created_at >= now() - interval '7 days')::int as recent_count,
      max(created_at) as last_at
    from tagged
    where tag <> ''
    group by tag
  )
  select
    a.tag,
    a.post_count,
    a.recent_count,
    c.img as cover_url,
    a.last_at
  from agg a
  left join lateral (
    -- The cover is the best-received picture the topic has, so a topic
    -- looks like the thing it is about rather than like whatever was
    -- posted most recently.
    select t.img
    from tagged t
    where t.tag = a.tag and t.img is not null
    order by t.hype_count desc, t.created_at desc
    limit 1
  ) c on true
  order by (a.recent_count * 3 + a.post_count) desc, a.last_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 40));
$$;

comment on function public.get_topic_cards(int) is
  'Topics for the pre-search screen: all-time volume with the last week weighted, each with a cover taken from its best public post.';

revoke execute on function public.search_people(text, int) from public, anon;
revoke execute on function public.search_posts(text, int) from public, anon;
revoke execute on function public.get_topic_cards(int) from public, anon;

grant execute on function public.search_people(text, int) to authenticated;
grant execute on function public.search_posts(text, int) to authenticated;
grant execute on function public.get_topic_cards(int) to authenticated;
