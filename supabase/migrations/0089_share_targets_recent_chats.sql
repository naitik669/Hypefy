-- The quick-share row: who you send posts and Shots to most, then the people
-- you have chatted with lately, then close friends and mutual follows. The
-- recent chats are new here: someone you message every day but have never sent
-- a post to, and who is not a mutual follow, never appeared in the row, which
-- left it empty for exactly the people you would share with. Blocks in either
-- direction are excluded.
create or replace function public.top_share_targets(p_limit int default 4)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_hue int,
  avatar_url text,
  sends bigint
)
language sql
security definer
set search_path to 'public'
as $$
  with me as (select auth.uid() as uid),
  sent as (
    select other.user_id, count(*)::bigint as sends, max(m.created_at) as last_at
    from messages m
    join conversation_members mine
      on mine.conversation_id = m.conversation_id and mine.user_id = (select uid from me)
    join conversation_members other
      on other.conversation_id = m.conversation_id and other.user_id <> (select uid from me)
    join conversations c on c.id = m.conversation_id and c.type <> 'group'
    where m.sender_id = (select uid from me)
      and m.kind in ('post', 'shot')
      and m.created_at > now() - interval '180 days'
    group by other.user_id
  ),
  chats as (
    select other.user_id, 0::bigint as sends, c.last_message_at as last_at
    from conversation_members mine
    join conversations c on c.id = mine.conversation_id and c.type <> 'group'
    join conversation_members other
      on other.conversation_id = c.id and other.user_id <> (select uid from me)
    where mine.user_id = (select uid from me)
      and c.last_message_at > now() - interval '90 days'
  ),
  friends as (
    select friend_id as user_id, 0::bigint as sends, null::timestamptz as last_at
    from close_friends where user_id = (select uid from me)
    union
    select f.following_id, 0::bigint, null::timestamptz
    from follows f
    join follows back on back.follower_id = f.following_id and back.following_id = (select uid from me)
    where f.follower_id = (select uid from me)
  ),
  ranked as (
    select user_id, max(sends) as sends, max(last_at) as last_at
    from (
      select * from sent
      union all select * from chats
      union all select * from friends
    ) all_lists
    where user_id <> (select uid from me)
    group by user_id
  )
  select p.id, p.display_name, p.username, p.avatar_hue, p.avatar_url, r.sends
  from ranked r
  join profiles p on p.id = r.user_id
  where not exists (
    select 1 from blocked_users b
    where (b.blocker_id = p.id and b.blocked_id = (select uid from me))
       or (b.blocker_id = (select uid from me) and b.blocked_id = p.id)
  )
  order by r.sends desc, r.last_at desc nulls last, p.display_name nulls last
  limit greatest(p_limit, 0);
$$;

revoke all on function public.top_share_targets(int) from public;
grant execute on function public.top_share_targets(int) to authenticated;
