-- Who sits in the rehype deck, by how much you and they actually interact.
--
-- 0107 filled the deck's three seats with the three newest rehypes by people
-- you follow. Newest is not most relevant: the rehype you care about is the
-- one from the friend you talk to every day, not whoever happened to tap last.
--
-- This ranks them. The signals and weights are the ones get_affinity already
-- uses to rank the Home and Discover feeds, so "people you interact with"
-- means the same thing everywhere in the app. Two things are done properly
-- here that get_affinity does not do, and are worth carrying back to it:
--
--   * a one-to-one chat counts by when you last talked, not as a flat 5 for
--     ever — get_affinity gives a conversation that died a year ago the same
--     weight as one from this morning, because it timestamps membership now();
--   * rehyping someone's Shot counts, as rehyping their post already did.
--
-- ── relationship strength ──────────────────────────────────────────────
--
-- Over the last 60 days, each signal decays linearly from 1 today to a floor
-- of 0.3 at the edge of the window (the same curve as get_affinity):
--
--   you hyped their post or Shot ............ 3
--   you commented on one .................... 4
--   you saved one ........................... 2
--   you rehyped one ......................... 3
--   a one-to-one chat, by its last message .. 5
--   they hyped yours ........................ 1.5   (half: their interest in
--   they commented on yours ................. 2      you is real, but it is
--                                                    your deck)
--
-- Invoker: everything it reads is already readable by the caller — hypes and
-- comments are public, saves and rehypes are your own, and messages only in
-- conversations you belong to. It returns only the caller's relationships.

create or replace function public.relationship_strength(
  p_user_ids uuid[],
  p_lookback_days integer default 60
)
returns table (user_id uuid, strength numeric)
language sql
stable
set search_path = public
as $$
  with params as (
    select auth.uid() as me,
           now() - make_interval(days => greatest(p_lookback_days, 1)) as since,
           greatest(p_lookback_days, 1)::numeric as span
  ),
  signal as (
    -- You hyped their post or Shot.
    select coalesce(p.user_id, s.user_id) as uid, 3.0 as w, h.created_at as at
      from public.hypes h
      left join public.posts p on h.target_type = 'post' and p.id = h.target_id
      left join public.shots s on h.target_type = 'shot' and s.id = h.target_id
     where h.user_id = (select me from params)
       and h.created_at >= (select since from params)
    union all
    -- You commented on their post or Shot.
    select coalesce(p.user_id, s.user_id), 4.0, c.created_at
      from public.comments c
      left join public.posts p on p.id = c.post_id
      left join public.shots s on s.id = c.shot_id
     where c.user_id = (select me from params)
       and c.created_at >= (select since from params)
       and c.removed_at is null and c.deleted_at is null
    union all
    -- You saved one.
    select p.user_id, 2.0, sp.created_at
      from public.saved_posts sp join public.posts p on p.id = sp.post_id
     where sp.user_id = (select me from params) and sp.created_at >= (select since from params)
    union all
    select s.user_id, 2.0, ss.created_at
      from public.saved_shots ss join public.shots s on s.id = ss.shot_id
     where ss.user_id = (select me from params) and ss.created_at >= (select since from params)
    union all
    -- You rehyped one.
    select p.user_id, 3.0, r.created_at
      from public.reposts r join public.posts p on p.id = r.post_id
     where r.user_id = (select me from params) and r.created_at >= (select since from params)
    union all
    select s.user_id, 3.0, r.created_at
      from public.shot_reposts r join public.shots s on s.id = r.shot_id
     where r.user_id = (select me from params) and r.created_at >= (select since from params)
    union all
    -- They hyped yours: half weight.
    select h.user_id, 1.5, h.created_at
      from public.hypes h
      left join public.posts p on h.target_type = 'post' and p.id = h.target_id
      left join public.shots s on h.target_type = 'shot' and s.id = h.target_id
     where h.user_id = any(p_user_ids)
       and coalesce(p.user_id, s.user_id) = (select me from params)
       and h.created_at >= (select since from params)
    union all
    -- They commented on yours: half weight.
    select c.user_id, 2.0, c.created_at
      from public.comments c
      left join public.posts p on p.id = c.post_id
      left join public.shots s on s.id = c.shot_id
     where c.user_id = any(p_user_ids)
       and coalesce(p.user_id, s.user_id) = (select me from params)
       and c.created_at >= (select since from params)
       and c.removed_at is null and c.deleted_at is null
    union all
    -- A one-to-one chat, dated by the most recent message in it.
    select other.user_id, 5.0, max(m.created_at)
      from public.conversation_members mine
      join public.conversations cv on cv.id = mine.conversation_id and cv.type = 'dm'
      join public.conversation_members other
        on other.conversation_id = cv.id and other.user_id <> mine.user_id
      join public.messages m
        on m.conversation_id = cv.id
       and m.created_at >= (select since from params)
       and m.removed_at is null
     where mine.user_id = (select me from params)
       and other.user_id = any(p_user_ids)
     group by other.user_id
  )
  select sg.uid,
         round(sum(
           sg.w * greatest(0.3, 1 - extract(epoch from now() - sg.at) / 86400.0 / (select span from params))
         )::numeric, 3)
    from signal sg
   where sg.uid = any(p_user_ids)
     and sg.uid <> (select me from params)
   group by sg.uid;
$$;

comment on function public.relationship_strength(uuid[], integer) is
  'How much the caller and each of these people interact over the last N days: get_affinity''s signals and weights, with chats dated by their last message and Shot rehypes counted.';

revoke all on function public.relationship_strength(uuid[], integer) from public, anon;
grant execute on function public.relationship_strength(uuid[], integer) to authenticated;

-- ── the deck, ranked ────────────────────────────────────────────────────
--
--   score = ln(1 + strength)                 who you actually interact with
--         + 1.5 · e^(−hours since rehype / 48) a fresh rehype is news
--         + 0.5 if you follow them            a deliberate, weaker signal
--
-- The log gives diminishing returns, so one very chatty contact cannot own
-- every deck. The recency term tops out at 1.5 — about one hype and a save —
-- so a brand-new rehype from someone you follow can still surface, but a real
-- relationship outranks it. Ties go to the newer rehype.
--
-- Eligible: people you follow, or anyone you have interacted with. Blocks in
-- either direction are excluded. Private accounts stay hidden from
-- non-followers, because this runs as the caller and reads rehypes through
-- 0106's rules. Only the 500 newest rehypes are considered, so a viral post
-- costs the same as any other; a close friend's rehype from before that
-- window is the one thing this can miss.
--
-- The return type gains `rank` (1 = best seat, 0 for your own row), so the
-- function is dropped and recreated.

drop function if exists public.rehype_deck(text, uuid);

create function public.rehype_deck(p_kind text, p_target uuid)
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  avatar_hue integer,
  is_me boolean,
  rehyped_at timestamptz,
  rank integer
)
language sql
stable
set search_path = public
as $$
  with r as (
    select x.user_id, x.created_at from public.reposts x
     where p_kind = 'post' and x.post_id = p_target
    union all
    select x.user_id, x.created_at from public.shot_reposts x
     where p_kind = 'shot' and x.shot_id = p_target
  ),
  recent as (
    select r.user_id, r.created_at from r
     where r.user_id <> auth.uid()
     order by r.created_at desc
     limit 500
  ),
  blocked as (
    select b as id from public.blocked_either_way() b where b is not null
  ),
  cand as (
    select rc.user_id, rc.created_at,
           exists (select 1 from public.follows f
                    where f.follower_id = auth.uid() and f.following_id = rc.user_id) as followed
      from recent rc
     where not exists (select 1 from blocked bl where bl.id = rc.user_id)
  ),
  strength as (
    select * from public.relationship_strength(array(select c.user_id from cand c))
  ),
  scored as (
    select c.user_id, c.created_at,
           ln(1 + coalesce(st.strength, 0))
           + 1.5 * exp(-(extract(epoch from now() - c.created_at) / 3600.0) / 48.0)
           + case when c.followed then 0.5 else 0 end as score
      from cand c
      left join strength st on st.user_id = c.user_id
     where c.followed or coalesce(st.strength, 0) > 0
  ),
  top as (
    select s.user_id, s.created_at,
           row_number() over (order by s.score desc, s.created_at desc) as rk
      from scored s
  )
  select r.user_id, p.display_name, p.username, p.avatar_url, p.avatar_hue, true, r.created_at, 0
    from r join public.profiles p on p.id = r.user_id
   where r.user_id = auth.uid()
  union all
  select t.user_id, p.display_name, p.username, p.avatar_url, p.avatar_hue, false, t.created_at, t.rk::integer
    from top t join public.profiles p on p.id = t.user_id
   where t.rk <= 3;
$$;

revoke all on function public.rehype_deck(text, uuid) from public, anon;
grant execute on function public.rehype_deck(text, uuid) to authenticated;

-- ── the Shots feed says who rehyped, by id ──────────────────────────────
--
-- So rehyping a Shot from the feed can record whose rehype brought it, the
-- same way the Home feed now does for posts, instead of guessing. The return
-- type gains rehyper_id, so the function is dropped and recreated unchanged
-- otherwise.

drop function if exists public.followed_shot_rehypes(integer);

create function public.followed_shot_rehypes(p_limit integer default 20)
returns table (rehyped_at timestamptz, rehyper_id uuid, rehyper_name text, shot jsonb)
language sql
stable
set search_path = public
as $$
  select latest.created_at, latest.user_id, coalesce(rp.display_name, rp.username),
    jsonb_build_object('id', s.id, 'user_id', s.user_id, 'media_url', s.media_url, 'poster_url', s.poster_url,
      'caption', s.caption, 'created_at', s.created_at, 'hype_count', s.hype_count, 'comment_count', s.comment_count,
      'save_count', s.save_count, 'duration_secs', s.duration_secs, 'trim_start', s.trim_start, 'trim_end', s.trim_end,
      'profiles', jsonb_build_object('display_name', ap.display_name, 'avatar_hue', ap.avatar_hue, 'avatar_url', ap.avatar_url, 'username', ap.username))
  from (select distinct on (r.shot_id) r.shot_id, r.user_id, r.created_at
          from public.shot_reposts r join public.follows f on f.following_id = r.user_id and f.follower_id = auth.uid()
         order by r.shot_id, r.created_at desc) latest
  join public.shots s on s.id = latest.shot_id
  join public.profiles rp on rp.id = latest.user_id
  join public.profiles ap on ap.id = s.user_id
  where s.user_id <> auth.uid()
  order by latest.created_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.followed_shot_rehypes(integer) from public, anon;
grant execute on function public.followed_shot_rehypes(integer) to authenticated;
