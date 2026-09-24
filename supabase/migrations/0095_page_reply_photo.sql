-- A reply to a photo page keeps the photo.
--
-- send_page_reply copies the page into the message so the chat can still show
-- it after the page has gone. It copied the words, colour and song but not the
-- picture (0093 came later), so a reply to a photo page showed an empty card.
-- The same function, with image_url added to the copy.

create or replace function public.send_page_reply(p_owner uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := (select auth.uid());
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_note public.notes;
  v_hue integer;
  v_conv uuid;
  v_msg uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if v_me = p_owner then raise exception 'Own page'; end if;
  if v_body is null then raise exception 'Empty message'; end if;
  if char_length(v_body) > 500 then raise exception 'Too long'; end if;

  select * into v_note from public.notes where user_id = p_owner and expires_at > now();
  if not found then raise exception 'No active note'; end if;
  if not exists (select 1 from public.get_notes() g where g.user_id = p_owner) then
    raise exception 'Not visible';
  end if;

  v_conv := public.get_or_create_dm(p_owner);
  select avatar_hue into v_hue from public.profiles where id = p_owner;

  insert into public.messages (conversation_id, sender_id, body, kind, metadata)
  values (
    v_conv, v_me, v_body, 'page_reply',
    jsonb_build_object('page', jsonb_build_object(
      'owner_id', p_owner,
      'text', v_note.text,
      'color', v_note.color,
      'hue', coalesce(v_hue, 280),
      'written_at', v_note.created_at,
      'image_url', v_note.image_url,
      'track', case when v_note.track is null then null else jsonb_build_object(
        'title', v_note.track->>'title',
        'artist', v_note.track->>'artist',
        'artwork', v_note.track->>'artwork'
      ) end
    ))
  )
  returning id into v_msg;

  update public.conversations
    set last_message_at = now(), last_message_id = v_msg, updated_at = now()
    where id = v_conv;

  return v_conv;
end $function$;
