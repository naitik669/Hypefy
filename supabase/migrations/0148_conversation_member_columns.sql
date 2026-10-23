-- Stop a group member from promoting themselves to admin.
--
-- `conversation_members` has one UPDATE policy — "conv_members: update own",
-- which checks only `user_id = auth.uid()` — and `authenticated` holds
-- table-wide UPDATE. So a plain member could PATCH their own row with
-- {"role":"admin"} and then add and remove members, change the group and
-- demote the person who created it.
--
-- Confirmed on the live database before this was written: the update
-- succeeded and the role read back as `admin`.
--
-- The same report claimed a member could also move their row to another
-- conversation by writing `conversation_id`, letting someone who had been
-- removed rejoin and read the history. Tested: the policy's check already
-- refuses that. Recorded here so nobody goes looking for a hole that is
-- not there.
--
-- The fix is the grant, not a trigger. Narrowing a column grant does
-- nothing while a table-wide grant stands — that is why 0142 needed a
-- trigger for the pin columns on `messages`, where the table-wide UPDATE
-- remains. Here the table-wide grant itself goes, so the column list is
-- the whole enforcement, and SECURITY DEFINER functions are unaffected
-- because they run as the owner.
--
-- Only two columns are written directly by the client, checked across the
-- whole of src/: `muted_at` (ConversationInfo, RealChatView) and
-- `pinned_at` (MessagesInbox). Everything else already goes through an RPC:
-- `last_read_at` via mark_conversation_read, `locked_at` and `hidden_at`
-- via set_chat_level, and `role` via the group-admin functions.
--
-- INSERT and DELETE are left alone on purpose: neither has a policy, so RLS
-- already refuses them whatever the grant says.

revoke update on public.conversation_members from authenticated, anon;

grant update (muted_at, pinned_at) on public.conversation_members to authenticated;
