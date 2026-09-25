-- Rank the faces by who you actually talk to.
--
-- 0097 ordered them close friend, mutual, follow, then recency. "Mutual" is a
-- weak proxy for closeness: it only means neither of you has unfollowed. The
-- people whose face makes you stop are the ones you message.
--
-- The app already has this notion. top_share_targets ranks people by recent
-- one-to-one chat activity, and reusing its shape means Hypefy has one idea of
-- who is close rather than two that disagree. The same window is used here:
-- a chat with a message in the last 90 days.
--
-- Also drops the viewer's own name from the line. The star beside the count is
-- already filled and gold when you have hyped something, so "You, Aman & 5
-- others" spends one of only two name slots restating what the star said. You
-- still count in the total, and you still lead the Hyped-by list.

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
  -- Everyone you have a live one-to-one thread with. Computed once for the
  -- whole page, and bounded by how many chats you have, not by how many
  -- people hyped anything.
  talk as (
    select distinct other.user_id
    from public.conversation_members mine
    cross join me
    join public.conversations c
      on c.id = mine.conversation_id
     and c.type <> 'group'
     and c.last_message_at > now() - interval '90 days'
    join public.conversation_members other
      on other.conversation_id = c.id and other.user_id <> me.id
    where mine.user_id = me.id
  ),
  mine as (
    select
      h.target_id,
      h.user_id,
      h.created_at,
      case
        when cf.friend_id is not null then 0  -- close friend, you said so
        when t.user_id is not null then 1     -- you two actually talk
        when back.id is not null then 2       -- mutual
        else 3                                -- you follow them
      end as tier
    from public.hypes h
    cross join me
    -- Only people the viewer follows get this far.
    join public.follows f
      on f.follower_id = me.id and f.following_id = h.user_id
    join public.profiles p on p.id = h.user_id
    left join public.close_friends cf
      on cf.user_id = me.id and cf.friend_id = h.user_id
    left join public.follows back
      on back.follower_id = h.user_id and back.following_id = me.id
    left join talk t on t.user_id = h.user_id
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

-- The sheet orders by the same idea, so the three faces on the card are the
-- three names at the top of the list rather than a different three.
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
  -- 'you' | 'close' | 'talk' | 'mutual' | 'following' | 'other'
  relation text,
  is_verified boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with me as (select (select auth.uid()) as id),
  talk as (
    select distinct other.user_id
    from public.conversation_members mine
    cross join me
    join public.conversations c
      on c.id = mine.conversation_id
     and c.type <> 'group'
     and c.last_message_at > now() - interval '90 days'
    join public.conversation_members other
      on other.conversation_id = c.id and other.user_id <> me.id
    where mine.user_id = me.id
  )
  select
    p.id,
    coalesce(nullif(btrim(p.display_name), ''), p.username) as name,
    p.username,
    p.avatar_url,
    p.avatar_hue as hue,
    case
      when p.id = me.id then 'you'
      when cf.friend_id is not null then 'close'
      when t.user_id is not null and f.id is not null then 'talk'
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
  left join talk t on t.user_id = h.user_id
  where me.id is not null
    and h.target_type = p_target_type
    and h.target_id = p_target_id
    and (p.show_hypes or p.id = me.id)
    and p.suspended_at is null
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
      when t.user_id is not null and f.id is not null then 2
      when f.id is not null and back.id is not null then 3
      when f.id is not null then 4
      else 5
    end,
    h.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 60))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

revoke execute on function public.hyped_by(text, uuid, integer, integer) from public, anon;
grant execute on function public.hyped_by(text, uuid, integer, integer) to authenticated;
