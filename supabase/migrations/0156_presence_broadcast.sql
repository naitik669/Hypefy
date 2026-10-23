-- Presence stops being a database write that other people wait on.
--
-- The heartbeat updates `profiles.last_seen_at` every 60 seconds for every
-- signed-in user. That part stays: it is what makes "Active 4m ago" work for
-- someone who is not online right now, and it is what the server renders into
-- the page on load.
--
-- What changes is how the OTHER party hears about it. RealChatView subscribed
-- to `postgres_changes` on `public.profiles`, which never fired, because
-- profiles is not in the realtime publication (see 0155). The obvious repair
-- — publish profiles — is the wrong one: it would put one WAL record per user
-- per minute into the decoder, forever, and have Realtime evaluate RLS on a
-- 47-column row for each of them, to deliver the message "still here". That is
-- the most expensive possible way to send the least interesting fact in the
-- app, and it grows with the number of signed-in users rather than with the
-- number of people looking at a chat.
--
-- So presence moves to a broadcast channel, which never touches the database.
-- The typing indicator in the same component already works this way.
--
-- This function's only job here is to tell the heartbeat whether it may
-- broadcast at all. `show_activity = false` means the reader has asked not to
-- be seen; the update already stores null for them, and returning that null
-- is what stops the client announcing a presence it just declined to record.
-- Returning the stored value rather than a boolean also means the sender
-- broadcasts the same timestamp the database holds, instead of its own clock.
--
-- The return type changes, so it has to be dropped rather than replaced.

drop function if exists public.touch_last_seen();

create function public.touch_last_seen()
returns timestamp with time zone
language sql
security definer
set search_path to 'public'
as $function$
  update public.profiles
     set last_seen_at = case when show_activity is false then null else now() end
   where id = (select auth.uid())
  returning last_seen_at;
$function$;

revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
