-- The inbox previously pulled EVERY message across all 50 conversations into the
-- app just to derive each thread's last message and unread count — an unbounded
-- read that grows with account age. This does both aggregations in the DB and
-- returns exactly one row per conversation.
--
-- Membership-scoped: the `mine` CTE restricts to conversations the caller
-- belongs to, so SECURITY DEFINER cannot leak other people's threads.
create or replace function public.get_inbox_summary(p_conversation_ids uuid[])
returns table (
  conversation_id uuid,
  last_body text,
  last_kind text,
  last_created_at timestamptz,
  last_sender_id uuid,
  unread_count int
)
language sql stable security definer set search_path = public as $$
  with mine as (
    select cm.conversation_id, cm.last_read_at
    from public.conversation_members cm
    where cm.user_id = (select auth.uid())
      and cm.conversation_id = any(p_conversation_ids)
  ),
  last_msg as (
    -- Uses messages_conversation_created_idx (conversation_id, created_at DESC)
    select distinct on (m.conversation_id)
           m.conversation_id, m.body, m.kind, m.created_at, m.sender_id
    from public.messages m
    where m.conversation_id in (select mine.conversation_id from mine)
    order by m.conversation_id, m.created_at desc
  ),
  unread as (
    select m.conversation_id, count(*)::int as n
    from public.messages m
    join mine on mine.conversation_id = m.conversation_id
    where m.sender_id <> (select auth.uid())
      and (mine.last_read_at is null or m.created_at > mine.last_read_at)
    group by m.conversation_id
  )
  select mine.conversation_id,
         lm.body, lm.kind, lm.created_at, lm.sender_id,
         coalesce(u.n, 0)
  from mine
  left join last_msg lm on lm.conversation_id = mine.conversation_id
  left join unread   u  on u.conversation_id  = mine.conversation_id;
$$;

revoke all on function public.get_inbox_summary(uuid[]) from public, anon;
grant execute on function public.get_inbox_summary(uuid[]) to authenticated;
