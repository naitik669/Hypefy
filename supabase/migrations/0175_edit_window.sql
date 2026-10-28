-- Editing closes after 45 minutes, and a refused edit says so.
--
-- Two problems with edit_message as it stood, both found while adding the
-- swipe-left gesture that reaches it.
--
-- There was **no time limit at all**. A message from any point in the
-- conversation's history could be rewritten, with only "edited" beside it
-- to say so. Somebody can read a message, reply to it, and have the thing
-- they were replying to changed under them a week later. Putting the limit
-- in the gesture alone would have left the RPC exactly as open as it was —
-- the gesture is a shortcut to a function anybody can call.
--
-- And it was a bare UPDATE with no row count checked, so every refusal
-- looked like a success: editing somebody else's message, a photo, an
-- unsent message or (now) an old one all returned void and the client
-- showed the new words until the next reload. A rule nobody is told about
-- is not a rule.
--
-- 45 minutes, as the app asked for. Long enough to fix a typo somebody has
-- not read yet, short enough that the thread above you is settled.
--
-- The window is checked against created_at, not edited_at, so a message
-- cannot be kept alive by editing it every 44 minutes.

create or replace function public.edit_message(p_message_id uuid, p_body text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.messages
     set body = p_body,
         edited_at = now()
   where id = p_message_id
     and sender_id = auth.uid()
     and kind = 'text'
     and coalesce(is_unsent, false) = false
     and created_at > now() - interval '45 minutes'
  returning id into v_id;

  if v_id is null then
    -- One message for every refusal on purpose. Which of the reasons it
    -- was is not something a caller probing other people's message ids
    -- should be told, and the only one a real user can hit is the clock.
    raise exception 'That message can no longer be edited';
  end if;
end $$;

revoke all on function public.edit_message(uuid, text) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated;

-- The same window on a folder's caption. It already raised on refusal, so
-- only the clock is new; without it the two paths would disagree about how
-- long a message stays yours to change.
create or replace function public.edit_album_caption(p_message_id uuid, p_caption text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_body text;
begin
  update public.messages
     set body = jsonb_set(body::jsonb, '{caption}', to_jsonb(left(btrim(coalesce(p_caption, '')), 40)))::text,
         edited_at = now()
   where id = p_message_id
     and sender_id = auth.uid()
     and kind = 'album'
     and coalesce(is_unsent, false) = false
     and created_at > now() - interval '45 minutes'
  returning body into v_body;

  if v_body is null then
    raise exception 'That caption can no longer be edited';
  end if;
  return v_body;
end $$;

revoke all on function public.edit_album_caption(uuid, text) from public, anon;
grant execute on function public.edit_album_caption(uuid, text) to authenticated;
