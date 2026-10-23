-- Six realtime subscriptions that have never received anything.
--
-- `postgres_changes` only delivers rows for tables in the `supabase_realtime`
-- publication. Four tables were ever added — messages (0001), message_reactions,
-- call_sessions and notifications — but the app subscribes to three more:
--
--   conversation_members   BottomNav (the unread badge), InAppNotifier (the
--                          locked-chat guard), MessagesInbox (clearing the
--                          badge when you read a thread elsewhere) and
--                          RealChatView.
--   conversations          MessagesInbox, to re-sort on last_message_at.
--   profiles               RealChatView, for the other party's presence dot.
--
-- None of them fired. The code is correct and the channels open; the WAL
-- decoder simply never sees those tables, so the callbacks are unreachable.
-- The features degraded quietly rather than breaking, which is why it lasted:
-- the inbox still refreshes on new messages, the badge still counts up, the
-- presence dot still shows whatever the server rendered on load.
--
-- This adds the one table that should be published. The other two are handled
-- in the app, and deliberately not here:
--
--   conversations  is NOT published. Its last_message_at changes on every
--                  message, so publishing it duplicates the messages firehose
--                  to say something the inbox already learns from the messages
--                  subscription it has. The dead subscription is deleted.
--
--   profiles       is NOT published. The presence heartbeat updates it every
--                  60 seconds per signed-in user; publishing it would put that
--                  in the WAL, decode it, and evaluate RLS for it, per
--                  subscriber, forever — a firehose whose entire payload is
--                  "still here". Presence moves to a broadcast channel
--                  instead, which costs the database nothing and follows the
--                  pattern the typing indicator in the same component already
--                  uses.
--
-- conversation_members is the one that earns it: narrow rows, and it changes
-- only when a person does something to a conversation — opens it, mutes it,
-- locks it, archives it, pins it. That is bounded by human action, not by
-- traffic.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_members'
  ) then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end
$$;

-- Replica identity stays default (the primary key). Every handler reads
-- `payload.new`, which is the full new row; none needs the old one.
