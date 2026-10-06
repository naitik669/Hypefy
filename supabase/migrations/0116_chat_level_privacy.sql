-- Whether you locked or hid a chat is yours to know, not the other person's.
--
-- conversation_members is readable by every member of the conversation
-- ("conv_members: members read"), which is how read receipts and the member
-- list work. locked_at and hidden_at sit on the same rows, so the person you
-- had hidden could ask the API for your membership row and see that you had.
--
-- Column privileges close that: members can still read every other column
-- of each other's rows, and nobody can read these two directly, their own
-- included. Your own levels come from my_chat_levels(), which only ever
-- returns the caller's.
--
-- The service role (push delivery) and SECURITY DEFINER functions are not
-- affected. Nothing in the app selects * from this table.

revoke select on table public.conversation_members from authenticated, anon;
grant select (conversation_id, user_id, created_at, role, last_read_at, muted_until, archived_at, blocked_at, request_accepted, muted_at, pinned_at)
  on table public.conversation_members to authenticated;

create or replace function public.my_chat_levels()
returns table (conversation_id uuid, level text)
language sql stable security definer set search_path = public as $$
  select cm.conversation_id,
         case when cm.locked_at is null then 'normal'
              when cm.hidden_at is not null then 'hidden'
              else 'locked' end
    from public.conversation_members cm
   where cm.user_id = (select auth.uid());
$$;

revoke all on function public.my_chat_levels() from public, anon;
grant execute on function public.my_chat_levels() to authenticated;
