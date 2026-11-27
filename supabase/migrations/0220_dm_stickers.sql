-- Stickers in a conversation: the foundation (T1 of the DM sticker plan).
--
-- A sticker is a picture and nothing else. No name, no caption, no title
-- (Naitik, 27 Nov): the picture is the whole of it. What it carries besides
-- the picture is how its edge is drawn, chosen once by whoever made it:
--
--   stroke  a white outline, drawn by the client at render time
--   clean   the cutout as it is
--
-- The outline is never baked into the file. One file serves both looks,
-- and a later change to how thick the outline is drawn changes every
-- sticker at once rather than only the new ones.
--
-- Three pieces:
--
--   public.stickers     whose sticker, where its file is, its edge, its size
--   bucket "stickers"   the files. PUBLIC, with unguessable names. Settled
--                       on 26 Nov: pack codes (T4) exist to hand stickers to
--                       strangers, so a private bucket would need a signed
--                       URL per sticker per viewer for a picture that is
--                       meant to travel. The name is <uid>/<uuid>.<ext>, and
--                       0151 already stopped anyone listing a bucket.
--   send_sticker()      puts one in a conversation. The client says WHICH
--                       sticker; the server copies where its file is and how
--                       its edge is drawn into the message, so a message can
--                       only ever point at a real sticker's file — never at
--                       an arbitrary URL, which is what a GIF body is.

create table if not exists public.stickers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  -- The object's name inside the stickers bucket. Its first folder is the
  -- owner, so the storage policy below and this row agree about whose it is.
  path text not null check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|webp)$'),
  edge text not null default 'stroke' check (edge in ('stroke', 'clean')),
  width int not null check (width between 1 and 1024),
  height int not null check (height between 1 and 1024),
  created_at timestamptz not null default now(),
  -- Soft, so a sticker already sent stays drawn in the threads it was sent
  -- to; a deleted one just stops being offered and stops being sendable.
  deleted_at timestamptz,
  constraint stickers_path_is_owners check (split_part(path, '/', 1) = owner_id::text),
  constraint stickers_path_unique unique (path)
);

create index if not exists stickers_owner_idx
  on public.stickers (owner_id, created_at desc)
  where deleted_at is null;

alter table public.stickers enable row level security;

drop policy if exists stickers_own_read on public.stickers;
create policy stickers_own_read on public.stickers
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists stickers_own_insert on public.stickers;
create policy stickers_own_insert on public.stickers
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and deleted_at is null);

-- Update exists only to set deleted_at. The column grant below is what
-- keeps it to that: the path, edge and size of a sticker that may already
-- be in other people's threads are not the owner's to rewrite afterwards.
drop policy if exists stickers_own_delete on public.stickers;
create policy stickers_own_delete on public.stickers
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on table public.stickers from anon, authenticated;
grant select, insert on table public.stickers to authenticated;
grant update (deleted_at) on table public.stickers to authenticated;

-- ── The bucket ──────────────────────────────────────────────────────────
-- 1 MB is ten times what a 512 px WebP cutout weighs; PNG is allowed for
-- the browsers that cannot encode WebP from a canvas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stickers', 'stickers', true, 1048576, array['image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "stickers: own upload" on storage.objects;
create policy "stickers: own upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'stickers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "stickers: own delete" on storage.objects;
create policy "stickers: own delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'stickers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Read back by storage after an upload (see 0195 on why a public bucket
-- still needs this); only your own folder, so it lists nothing of anyone
-- else's.
drop policy if exists "stickers: own select" on storage.objects;
create policy "stickers: own select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'stickers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ── Sending one ─────────────────────────────────────────────────────────
-- Separate from send_message for the reason send_poll is (0174): the
-- metadata here is the server's to write, and widening send_message's
-- whitelist to let a caller say where a sticker's file is would undo it.
--
-- Any live sticker may be sent, not only your own: a sticker somebody sent
-- you can be forwarded, and its id is only ever learned from a message you
-- could already see. The picture behind it is public either way.
create or replace function public.send_sticker(
  p_conversation_id uuid,
  p_sticker_id uuid,
  p_reply_to_id uuid default null,
  p_forwarded boolean default false
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
  v_st public.stickers%rowtype;
  v_msg public.messages%rowtype;
  v_prev_count int;
  v_other uuid;
  v_meta jsonb;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.is_conv_member(p_conversation_id) then raise exception 'Not a member'; end if;

  select * into v_st from public.stickers
   where id = p_sticker_id and deleted_at is null;
  if v_st.id is null then raise exception 'No such sticker'; end if;

  -- Mirrors send_message: somebody who has blocked you does not receive a
  -- sticker from you either.
  if exists (
    select 1 from public.conversation_members cm
    join public.blocked_users b on b.blocker_id = cm.user_id and b.blocked_id = v_me
    where cm.conversation_id = p_conversation_id and cm.user_id <> v_me
  ) then
    raise exception 'blocked';
  end if;

  v_meta := jsonb_build_object(
    'sticker_id', v_st.id,
    'path', v_st.path,
    'edge', v_st.edge,
    'w', v_st.width,
    'h', v_st.height
  );
  if coalesce(p_forwarded, false) then
    v_meta := v_meta || jsonb_build_object('forwarded', true);
  end if;

  select count(*) into v_prev_count from public.messages where conversation_id = p_conversation_id;

  insert into public.messages (conversation_id, sender_id, body, kind, reply_to_id, metadata)
  values (p_conversation_id, v_me, null, 'sticker', p_reply_to_id, v_meta)
  returning * into v_msg;

  update public.conversations
     set last_message_at = now(), last_message_id = v_msg.id, updated_at = now()
   where id = p_conversation_id;

  -- The same first-message notification send_message writes, so a chat
  -- that opens with a sticker still tells the other person it exists.
  select user_id into v_other from public.conversation_members
   where conversation_id = p_conversation_id and user_id <> v_me limit 1;
  if v_other is not null and v_prev_count = 0 then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (v_other, v_me, 'new_message', 'conversation', p_conversation_id, 'sent you a message');
  end if;

  return json_build_object(
    'id', v_msg.id, 'conversation_id', v_msg.conversation_id, 'sender_id', v_msg.sender_id,
    'body', v_msg.body, 'kind', v_msg.kind, 'reply_to_id', v_msg.reply_to_id,
    'is_unsent', v_msg.is_unsent, 'metadata', v_msg.metadata, 'created_at', v_msg.created_at
  );
end $$;

revoke all on function public.send_sticker(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.send_sticker(uuid, uuid, uuid, boolean) to authenticated;
