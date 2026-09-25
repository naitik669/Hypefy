-- You were filed under "Everyone else".
--
-- 0098 worked out the relationship from follows and close_friends, and
-- nobody follows themselves — so the viewer's own row fell through every
-- case to 'other' and sorted below strangers, on a list they had reached by
-- tapping their own hype.
--
-- 'you' is now its own relation and sorts first, above close friends. Two
-- smaller things follow from it: Quiet hides your name from other people,
-- not from yourself, and a private account is always visible to its owner.
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
  -- 'you' | 'close' | 'mutual' | 'following' | 'other'. The client says
  -- "you" / "close friend" / "mutual" / "you follow", and nothing for other.
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
      when p.id = me.id then 'you'
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
    -- Quiet keeps you out of other people's proof surfaces, not your own.
    and (p.show_hypes or p.id = me.id)
    and p.suspended_at is null
    -- A private account appears to its followers, and always to its owner.
    and (not p.is_private or f.id is not null or p.id = me.id)
    and not exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = me.id and b.blocked_id = h.user_id)
         or (b.blocker_id = h.user_id and b.blocked_id = me.id)
    )
  order by
    case
      when p.id = me.id then 0
      when cf.friend_id is not null then 1
      when f.id is not null and back.id is not null then 2
      when f.id is not null then 3
      else 4
    end,
    h.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 60))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

revoke execute on function public.hyped_by(text, uuid, integer, integer) from public, anon;
grant execute on function public.hyped_by(text, uuid, integer, integer) to authenticated;
