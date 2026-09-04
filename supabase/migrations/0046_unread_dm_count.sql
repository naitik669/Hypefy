-- The unread-DM badge was reading the entire message history, on every page.
--
-- (app)/layout.tsx fetched conversation_members with no limit, then EVERY
-- message across all of those conversations with no limit, and reduced them in
-- JavaScript — in the shared signed-in layout, so on every server render of
-- every page in the app, to produce a single integer.
--
-- The transfer cost was the smaller half. The order was globally descending
-- across all conversations, so once PostgREST's row cap was reached, one
-- chatty thread filled the whole window and every other conversation's latest
-- message was truncated away. The badge did not merely get slow — it silently
-- UNDER-COUNTED, and got progressively wronger the more the app was used.
--
-- This keeps the exact rule the JavaScript applied rather than tidying it up
-- on the way past: look only at the LATEST message in each conversation, skip
-- muted conversations, and skip any conversation where you spoke last. An
-- "any unread message" rule would be defensible but is a different number, and
-- changing behaviour silently while fixing performance is how regressions get
-- attributed to the wrong commit.
--
-- Verified before replacing the old path: this returns the same count as the
-- existing logic for every user who currently has one.
--
-- The lateral limit-1 rides messages_conversation_created_idx
-- (conversation_id, created_at DESC), which already existed.

create or replace function public.unread_dm_count()
returns int
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*)::int
  from public.conversation_members cm
  join lateral (
    select m.sender_id, m.created_at
    from public.messages m
    where m.conversation_id = cm.conversation_id
    order by m.created_at desc
    limit 1
  ) last on true
  where cm.user_id = (select auth.uid())
    and cm.blocked_at is null
    and cm.muted_at is null
    and last.sender_id <> cm.user_id
    and (cm.last_read_at is null or last.created_at > cm.last_read_at);
$$;

-- SECURITY DEFINER bypasses RLS, so the scoping to auth.uid() above is the
-- only thing keeping this to your own conversations. anon has no business
-- calling it at all.
revoke all on function public.unread_dm_count() from public, anon;
grant execute on function public.unread_dm_count() to authenticated;
