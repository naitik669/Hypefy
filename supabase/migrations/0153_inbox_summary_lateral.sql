-- Opening Messages should not read every message in every chat.
--
-- get_inbox_summary is called for the fifty conversations the inbox lists.
-- Two of its three CTEs scaled with the whole history rather than with what
-- is shown:
--
--   last_msg  `distinct on (conversation_id) … order by conversation_id,
--             created_at desc`. Postgres has no loose index scan, so this
--             reads EVERY row of each of the fifty conversations in index
--             order and throws away all but the first.
--
--   unread    `count(*)` with no bound. For any chat where last_read_at is
--             null — every chat you have never opened — that counts the
--             entire history.
--
-- So the cost of opening the inbox was the total message count of fifty
-- conversations, on a table that is the busiest in the app.
--
-- Both become laterals. The first is the standard rewrite and is the one
-- `unread_dm_count` (0115) already used, so this brings the two into line.
--
-- The count is capped at 100 by a `limit` inside the subquery, which is
-- what stops it walking a long history. That is invisible: UnreadBadge
-- renders "9+" for anything above nine (MessagesInbox.tsx:126), so no
-- number over ten has ever reached a screen. The cap is 100 rather than 10
-- to leave room if that badge is ever changed to show more.

create or replace function public.get_inbox_summary(p_conversation_ids uuid[])
returns table(
  conversation_id uuid,
  last_body text,
  last_kind text,
  last_created_at timestamp with time zone,
  last_sender_id uuid,
  unread_count integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with mine as (
    select cm.conversation_id, cm.last_read_at, cm.locked_at
    from public.conversation_members cm
    where cm.user_id = (select auth.uid())
      and cm.conversation_id = any(p_conversation_ids)
  )
  select mine.conversation_id,
         case when mine.locked_at is not null then null else lm.body end,
         case when mine.locked_at is not null then 'locked' else lm.kind end,
         lm.created_at,
         lm.sender_id,
         coalesce(u.n, 0)
  from mine
  -- One row per conversation, found by walking the
  -- (conversation_id, created_at desc) index exactly one step.
  left join lateral (
    select m.body, m.kind, m.created_at, m.sender_id
    from public.messages m
    where m.conversation_id = mine.conversation_id
    order by m.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*)::int as n
    from (
      select 1
      from public.messages m
      where m.conversation_id = mine.conversation_id
        and m.sender_id <> (select auth.uid())
        and (mine.last_read_at is null or m.created_at > mine.last_read_at)
      limit 100
    ) capped
  ) u on true;
$function$;
