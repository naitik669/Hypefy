-- A number says how popular something is. A face says someone you know
-- thought it was worth it.
--
-- Everything needed for the second was already stored and never read: hypes
-- joined to follows is "people you follow who hyped this". Two reads and one
-- column, and no new tables — close_friends, follows and blocked_users all
-- already exist, as does every index these functions need (hypes_target_idx,
-- follows_follower_idx, follows_following_follower_idx, close_friends_pkey,
-- and blocked_users in both directions).
--
-- Deliberately scoped to public.hypes. Spotlight pages count their hypes in
-- note_hypes and promise no viewer list and no public count; nothing here can
-- reach them, and the client draws them with a different component so that
-- promise stays structural rather than remembered.

-- ── The off switch, which ships with the feature rather than after it ────
--
-- Not show_activity: that one is about last-seen, and hiding when you were
-- online is a different decision from hiding that you liked something.
alter table public.profiles
  add column if not exists show_hypes boolean not null default true;

-- 0050 revoked the table-level update grant and rebuilt it column by column,
-- on purpose, so a column added later is unwritable until it is named here.
grant update (show_hypes) on public.profiles to authenticated;

-- ── Who, of the people you follow, hyped these ──────────────────────────
--
-- Takes a page of targets and answers for all of them at once. One call per
-- feed page: per-card would be ten round trips a screen, which is the one way
-- this becomes a performance problem.
--
-- At most three previewers, ordered close friends → mutuals → people you
-- follow, then most recent first. Never by follower count: the biggest
-- account in your graph is usually the least relevant person in it.
--
-- The total is not returned. Posts and shots already carry hype_count, so
-- counting rows here would repeat work the caller has already done.
create or replace function public.hype_proof(
  p_target_type text,
  p_target_ids uuid[]
)
returns table (target_id uuid, previewers jsonb, friend_count integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with me as (select (select auth.uid()) as id),
  mine as (
    select
      h.target_id,
      h.user_id,
      h.created_at,
      case
        when cf.friend_id is not null then 0  -- close friend, you said so
        when back.id is not null then 1       -- mutual, both ways
        else 2                                -- you follow them
      end as tier
    from public.hypes h
    cross join me
    -- The join that does the work: only people the viewer follows get here.
    join public.follows f
      on f.follower_id = me.id and f.following_id = h.user_id
    join public.profiles p on p.id = h.user_id
    left join public.close_friends cf
      on cf.user_id = me.id and cf.friend_id = h.user_id
    left join public.follows back
      on back.follower_id = h.user_id and back.following_id = me.id
    where me.id is not null
      and h.target_type = p_target_type
      and h.target_id = any(p_target_ids)
      and h.user_id <> me.id
      and p.show_hypes
      and p.suspended_at is null
      and not exists (
        select 1 from public.blocked_users b
        where (b.blocker_id = me.id and b.blocked_id = h.user_id)
           or (b.blocker_id = h.user_id and b.blocked_id = me.id)
      )
  ),
  ranked as (
    select
      m.*,
      row_number() over (
        partition by m.target_id
        order by m.tier, m.created_at desc
      ) as rn
    from mine m
  )
  select
    r.target_id,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', coalesce(nullif(btrim(p.display_name), ''), p.username),
          'username', p.username,
          'avatar_url', p.avatar_url,
          'hue', p.avatar_hue
        )
        order by r.rn
      ) filter (where r.rn <= 3),
      '[]'::jsonb
    ) as previewers,
    count(*)::int as friend_count
  from ranked r
  join public.profiles p on p.id = r.user_id
  group by r.target_id;
$function$;

revoke execute on function public.hype_proof(text, uuid[]) from public, anon;
grant execute on function public.hype_proof(text, uuid[]) to authenticated;

-- ── The people you and someone else both follow ─────────────────────────
--
-- Shown on their profile and, more usefully, on a chat neither of you has
-- ever written in. Independent of hypes entirely.
--
-- No privacy filter on the names: every person returned is someone the caller
-- already follows, so they can already see them. The line is rendered for the
-- caller alone and tells them nothing they did not already have.
--
-- The CTE is not named "both": BOTH is reserved (trim(both ...)) and the
-- statement will not parse.
create or replace function public.shared_follows(p_other uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with me as (select (select auth.uid()) as id),
  shared as (
    select
      p.id,
      coalesce(nullif(btrim(p.display_name), ''), p.username) as name,
      (cf.friend_id is not null) as is_close
    from public.follows a
    cross join me
    join public.follows b
      on b.follower_id = p_other and b.following_id = a.following_id
    join public.profiles p on p.id = a.following_id
    left join public.close_friends cf
      on cf.user_id = me.id and cf.friend_id = p.id
    where me.id is not null
      and p_other is not null
      and a.follower_id = me.id
      and p.id <> me.id
      and p.id <> p_other
      and p.suspended_at is null
      and not exists (
        select 1 from public.blocked_users x
        where (x.blocker_id = me.id and x.blocked_id = p.id)
           or (x.blocker_id = p.id and x.blocked_id = me.id)
      )
  ),
  ordered as (
    -- Close friends lead, then alphabetical, so the three named are the same
    -- from one visit to the next.
    select s.name, row_number() over (order by s.is_close desc, s.name) as rn
    from shared s
  )
  select jsonb_build_object(
    'count', (select count(*)::int from shared),
    'names', coalesce(
      (select jsonb_agg(o.name order by o.rn) from ordered o where o.rn <= 3),
      '[]'::jsonb
    )
  );
$function$;

revoke execute on function public.shared_follows(uuid) from public, anon;
grant execute on function public.shared_follows(uuid) to authenticated;
