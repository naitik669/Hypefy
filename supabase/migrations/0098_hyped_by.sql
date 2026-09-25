-- The list behind the line.
--
-- hype_proof answers "which of my people" for a whole feed page at once and
-- stops at three faces. This answers "everyone", one target at a time, paged,
-- and it is the only place the full list is ever assembled.
--
-- The order is the feature: close friends, mutuals, people you follow, then
-- everybody else by recency. Strangers come last but they do come — passing
-- them on the way out is the only reason anyone ever follows one, which is
-- why they are below a divider in the same list rather than behind a tab.
--
-- Counts are not returned. The caller already has the total from hype_count
-- and the friend count from hype_proof.
create or replace function public.hyped_by(
  p_target_type text,
  p_target_id uuid,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  username text,
  avatar_url text,
  hue integer,
  -- 'close' | 'mutual' | 'following' | 'other'. The client says "close
  -- friend" / "mutual" / "you follow" from this, and says nothing for other.
  relation text,
  is_verified boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with me as (select (select auth.uid()) as id)
  select
    p.id,
    coalesce(nullif(btrim(p.display_name), ''), p.username) as name,
    p.username,
    p.avatar_url,
    p.avatar_hue as hue,
    case
      when cf.friend_id is not null then 'close'
      when f.id is not null and back.id is not null then 'mutual'
      when f.id is not null then 'following'
      else 'other'
    end as relation,
    p.is_verified
  from public.hypes h
  cross join me
  join public.profiles p on p.id = h.user_id
  left join public.follows f
    on f.follower_id = me.id and f.following_id = h.user_id
  left join public.follows back
    on back.follower_id = h.user_id and back.following_id = me.id
  left join public.close_friends cf
    on cf.user_id = me.id and cf.friend_id = h.user_id
  where me.id is not null
    and h.target_type = p_target_type
    and h.target_id = p_target_id
    -- Quiet keeps you out of every proof surface, this one included.
    and p.show_hypes
    and p.suspended_at is null
    -- A private account appears only to someone who follows it.
    and (not p.is_private or f.id is not null or p.id = me.id)
    and not exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = me.id and b.blocked_id = h.user_id)
         or (b.blocker_id = h.user_id and b.blocked_id = me.id)
    )
  order by
    case
      when cf.friend_id is not null then 0
      when f.id is not null and back.id is not null then 1
      when f.id is not null then 2
      else 3
    end,
    h.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 60))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

revoke execute on function public.hyped_by(text, uuid, integer, integer) from public, anon;
grant execute on function public.hyped_by(text, uuid, integer, integer) to authenticated;
