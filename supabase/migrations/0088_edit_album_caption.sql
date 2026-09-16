-- Editing a photo folder's caption.
--
-- A folder is a message of kind 'album' whose body is JSON:
-- { "caption": text, "items": [{ "url", "type" }] }. edit_message only edits
-- text messages, and letting it write an album's whole body would let a
-- sender swap the photos someone already saw. This changes the caption and
-- nothing else, with the same 40-character limit the app sets.

create or replace function public.edit_album_caption(p_message_id uuid, p_caption text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
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
  returning body into v_body;

  if v_body is null then
    raise exception 'Not found';
  end if;
  return v_body;
end $$;

revoke all on function public.edit_album_caption(uuid, text) from public, anon;
grant execute on function public.edit_album_caption(uuid, text) to authenticated;
