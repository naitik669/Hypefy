-- Chat photos, videos, documents and voice notes stop being public.
--
-- Both buckets were public, and every message body stores the permanent
-- public URL the file was uploaded under. Anyone holding that URL — a leaked
-- link, a screenshot of one, somebody who was once in the chat — could open a
-- private DM's attachment forever, with no login. 0034 said so in its own
-- header; this closes it.
--
-- The URLs already stored in message bodies are left exactly as they are.
-- The client turns each into a short-lived signed link on the way to the
-- screen, and storage signs one only for somebody this function admits.
--
-- The obstacle is that an object's path is `{uploader}/{timestamp}.ext` — it
-- names no conversation — so storage RLS cannot tell whose chat a file belongs
-- to by looking at it. What can tell is the message that references it. So
-- access is: you uploaded it, or you are a member of a conversation holding a
-- live message whose body contains that path. That is also what makes
-- forwarding work with no special case: the forwarded message carries the same
-- path, so its new recipients qualify through it.
--
-- The scan is `strpos` over the caller's own conversations' media messages.
-- There are about sixty objects today and this is cheap; if chat media grows
-- large, add a `media_path` column on messages and index it, and replace the
-- body of this function — nothing outside it needs to change.

create or replace function public.can_read_chat_media(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- Your own uploads, including one that has not been sent yet.
    (storage.foldername(p_path))[1] = auth.uid()::text
    or exists (
      select 1
        from public.messages m
        join public.conversation_members cm
          on cm.conversation_id = m.conversation_id
       where cm.user_id = auth.uid()
         and m.is_unsent = false
         and m.kind in ('image', 'video', 'voice', 'document', 'album')
         and m.body is not null
         -- strpos, not LIKE: an underscore or percent in a filename is a
         -- wildcard to LIKE and a literal character to us.
         and strpos(m.body, p_path) > 0
    ),
    false
  );
$$;

comment on function public.can_read_chat_media(text) is
  'Whether the caller may read a chat-media or voice-notes object: they uploaded it, or are in a conversation with a live message that references it.';

revoke all on function public.can_read_chat_media(text) from public, anon;
grant execute on function public.can_read_chat_media(text) to authenticated;

-- Reading is now members-only. Insert and delete policies are unchanged: you
-- still upload into and delete from your own folder.
drop policy if exists "chat_media_select" on storage.objects;
create policy "chat_media_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-media' and public.can_read_chat_media(name));

drop policy if exists "voice_notes_select" on storage.objects;
create policy "voice_notes_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'voice-notes' and public.can_read_chat_media(name));

-- And the public URL stops resolving. A signed link works for a private
-- bucket; the old /object/public/ address does not.
update storage.buckets
   set public = false
 where id in ('chat-media', 'voice-notes');
