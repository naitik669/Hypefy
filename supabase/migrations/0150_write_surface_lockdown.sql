-- Batch 3b: close the write holes the verification pass confirmed.
--
-- Every grant below was derived by reading the actual call sites, not by
-- guessing. Where the client turned out to write nothing directly, the
-- privilege is revoked outright rather than narrowed.

-- ── C1. Only start_call may create a call ─────────────────────────────────
--
-- `calls_insert_caller` checks only `caller_id = auth.uid()`. No membership
-- check, no block check. So a direct INSERT with any receiver_id and any
-- conversation_id was accepted — which is a call to anyone, including
-- someone who has blocked you, and the backup postgres_changes listener in
-- CallProvider rings their phone. Confirmed accepted in a dry run.
--
-- `calls_update_party` has no WITH CHECK either, so a party could rewrite
-- receiver_id after the fact.
--
-- The client never touches this table directly: start_call, accept_call,
-- decline_call, end_call, mark_call_missed and mark_call_busy are all RPCs,
-- and /calls only reads. So both privileges go entirely; SELECT stays.

revoke insert, update on public.call_sessions from authenticated, anon;

-- ── C2. Messages are written by their RPCs, not by the client ─────────────
--
-- "messages: sender update" checks only `sender_id = auth.uid()`, and
-- authenticated held table-wide UPDATE, so a sender could rewrite a
-- delivered message's `kind` to 'system' along with its body. The thread
-- renders system rows centred, unattributed and with no sender — an
-- unattributable forged notice in someone else's chat. Confirmed accepted.
--
-- Nothing in src/ updates this table directly: send_message, edit_message,
-- unsend_message and edit_album_caption are all RPCs. So UPDATE goes.
--
-- This also makes 0142's pin trigger redundant. It stays: it costs one
-- comparison and it is the thing that holds if UPDATE is ever re-granted.

revoke update on public.messages from authenticated, anon;

-- ── C3. Server-owned columns cannot be set at INSERT ──────────────────────
--
-- 0131 restricted UPDATE on posts and shots and left INSERT open, so a row
-- could be created with hype_count already set to anything, with pinned_at
-- set directly (bypassing the three-pin cap), or with created_at and
-- removed_at chosen. Confirmed: an INSERT with hype_count 999999 was
-- accepted. That is the feed's ranking input.
--
-- The column lists are exactly what UploadProvider sends.

revoke insert on public.posts from authenticated, anon;
grant insert (user_id, caption, body, image_url, image_urls, hashtags, mentions, track, poll, aspect_ratio)
  on public.posts to authenticated;

revoke insert on public.shots from authenticated, anon;
grant insert (user_id, media_url, caption, poster_url, track, hashtags, mentions, duration_secs, trim_start, trim_end)
  on public.shots to authenticated;

-- ── C5. An author cannot undo a moderator ─────────────────────────────────
--
-- 0131 did this for posts, Shots and comments and skipped Shows. Confirmed:
-- the owner cleared removed_at, removed_by and removal_reason on their own
-- Show. The client only ever writes is_showcase (ShowViewer); creation sends
-- user_id, media_url, caption, track and linked_post_id.

revoke insert, update on public.shows from authenticated, anon;
grant insert (user_id, media_url, caption, track, linked_post_id) on public.shows to authenticated;
grant update (is_showcase) on public.shows to authenticated;

-- ── C8. A guessed media path is not enough ────────────────────────────────
--
-- can_read_chat_media passed if ANY message in ANY of the caller's
-- conversations contained the path as a substring. Since the caller can
-- insert messages into their own conversations, that reduced to: guess the
-- victim's `<uid>/<timestamp>.jpg`, send yourself a message whose body is
-- that string, and read their file.
--
-- The added clause is that the file must actually have been sent, at some
-- point, by the person whose folder it is. The attacker's own planted
-- message cannot satisfy that, because they are not the folder's owner.
--
-- Deliberately NOT "the message containing it was sent by the folder owner",
-- which is the tighter rule: forwarding re-sends the same body under a new
-- sender (ForwardSheet passes the original p_body to send_message), so that
-- version would stop a forwarded photo loading for the person it was
-- forwarded to.
--
-- This narrows the hole rather than closing it: an attacker who guesses the
-- exact path of a file the victim really did send somewhere still passes.
-- The complete fix is random object names so paths cannot be guessed at all,
-- which is an upload-side change and is tracked separately.

create or replace function public.can_read_chat_media(p_path text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (storage.foldername(p_path))[1] = auth.uid()::text
    or (
      exists (
        select 1 from public.messages m
        join public.conversation_members cm on cm.conversation_id = m.conversation_id
        where cm.user_id = auth.uid()
          and m.is_unsent = false
          and m.kind in ('image','video','voice','document','album')
          and m.body is not null
          and strpos(m.body, p_path) > 0
      )
      and exists (
        select 1 from public.messages m0
        where m0.sender_id::text = (storage.foldername(p_path))[1]
          and m0.is_unsent = false
          and m0.body is not null
          and strpos(m0.body, p_path) > 0
      )
    ),
    false);
$function$;

-- ── C10. The privileged-column guard actually runs ────────────────────────
--
-- tg_profiles_preserve_privileged is SECURITY DEFINER and owned by postgres,
-- so `current_user` inside it is always postgres and its early return always
-- fired — the trigger has never done anything.
--
-- Worth stating plainly: the 0050 column grants are what have been holding,
-- and a dry run confirmed self-granting is_admin is refused today. This is
-- restoring defence in depth, not closing an open hole. SECURITY INVOKER is
-- what the other cosmetics triggers use.

alter function public.tg_profiles_preserve_privileged() security invoker;
