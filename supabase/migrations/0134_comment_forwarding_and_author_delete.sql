-- 0134 — forwarding a comment into a chat, and a creator's own moderation
--
-- Two things the held-comment menu needs from the database.
--
-- 1. Deleting a comment was the comment author's alone: the table's only
--    delete rule is `auth.uid() = user_id`. But a comment sits on someone
--    else's post, and the person whose post it is had no way to take it off
--    short of reporting it to us and waiting. Now either of them can.
--
-- 2. Forwarding a comment sends the post or Shot it was left on, with the
--    comment named in the message's metadata. The client is never allowed to
--    write that column freely (0110), so send_message takes a comment id,
--    checks it really belongs to the content being sent, and builds the
--    object itself. Only the id is kept: the chat reads the comment's words
--    through the comments table, so an edited one follows and a deleted one
--    says it is gone, rather than the chat holding a copy forever.

-- ── 1. Delete a comment: its author, or whoever owns what it sits on ──────

create or replace function public.delete_comment(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
  v_n int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  -- Soft, like every other comment delete: the row stays so replies and
  -- counts stay consistent, and `deleted_at` is what every read filters on.
  -- An already-deleted or admin-removed comment is left exactly as it is.
  update public.comments c
     set deleted_at = now()
   where c.id = p_id
     and c.deleted_at is null
     and c.removed_at is null
     and (
       c.user_id = v_me
       or exists (select 1 from public.posts p where p.id = c.post_id and p.user_id = v_me)
       or exists (select 1 from public.shots s where s.id = c.shot_id and s.user_id = v_me)
     );
  get diagnostics v_n = row_count;
  return v_n > 0;
end
$function$;

revoke all on function public.delete_comment(uuid) from public, anon;
grant execute on function public.delete_comment(uuid) to authenticated;


-- ── 2. send_message can name the comment a share is about ─────────────────
--
-- Dropped and recreated rather than overloaded, for the same reason 0110
-- gave: two functions differing only by a trailing default make every
-- named-argument call ambiguous, and every caller uses named arguments.

drop function if exists public.send_message(uuid, text, text, uuid, uuid, uuid, text, jsonb);

create function public.send_message(
  p_conversation_id uuid,
  p_body text default null,
  p_kind text default 'text',
  p_post_id uuid default null,
  p_reply_to_id uuid default null,
  p_shot_id uuid default null,
  p_storage_path text default null,
  p_metadata jsonb default null,
  p_comment_id uuid default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
  v_msg public.messages%rowtype;
  v_prev_count int;
  v_other uuid;
  v_meta jsonb := '{}'::jsonb;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.is_conv_member(p_conversation_id) then raise exception 'Not a member'; end if;
  if (p_body is null or btrim(p_body) = '') and p_post_id is null and p_shot_id is null and p_storage_path is null then
    raise exception 'Empty message';
  end if;
  if p_kind = 'oneshot' and p_storage_path is null then
    raise exception 'OneShot requires a storage path';
  end if;

  if exists (
    select 1 from public.conversation_members cm
    join public.blocked_users b on b.blocker_id = cm.user_id and b.blocked_id = v_me
    where cm.conversation_id = p_conversation_id and cm.user_id <> v_me
  ) then
    raise exception 'blocked';
  end if;

  -- The one thing a caller may say about a message: which slide of a post.
  -- A post holds at most 20 photos, so anything outside 0..19 is clamped.
  if p_kind = 'post' and jsonb_typeof(p_metadata -> 'slide') = 'number' then
    v_meta := jsonb_build_object(
      'slide', least(greatest(floor((p_metadata ->> 'slide')::numeric)::int, 0), 19)
    );
  end if;

  -- A forwarded comment. The id is only recorded when the comment is really
  -- a live comment on the very post or Shot being sent, so the chat can
  -- trust it without re-checking, and a made-up id simply sends the content
  -- on its own rather than failing.
  if p_kind in ('post', 'shot') and p_comment_id is not null and exists (
    select 1 from public.comments c
     where c.id = p_comment_id
       and c.deleted_at is null
       and c.removed_at is null
       and ((p_kind = 'post' and c.post_id = p_post_id)
         or (p_kind = 'shot' and c.shot_id = p_shot_id))
  ) then
    v_meta := v_meta || jsonb_build_object('comment_id', p_comment_id);
  end if;

  select count(*) into v_prev_count from public.messages where conversation_id = p_conversation_id;
  insert into public.messages (conversation_id, sender_id, body, kind, post_id, shot_id, reply_to_id, metadata)
    values (
      p_conversation_id, v_me,
      case when p_kind = 'oneshot' then null else nullif(btrim(p_body), '') end,
      p_kind, p_post_id, p_shot_id, p_reply_to_id, v_meta
    )
    returning * into v_msg;

  if p_kind = 'oneshot' then
    insert into public.oneshots (message_id, sender_id, conversation_id, storage_path)
    values (v_msg.id, v_me, p_conversation_id, p_storage_path);
  end if;

  update public.conversations set last_message_at = now(), last_message_id = v_msg.id, updated_at = now()
    where id = p_conversation_id;
  select user_id into v_other from public.conversation_members
    where conversation_id = p_conversation_id and user_id <> v_me limit 1;
  if v_other is not null and (v_prev_count = 0 or p_kind in ('post','shot')) then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (v_other, v_me,
      case when p_kind in ('post','shot') then 'dm_post_shared' else 'new_message' end,
      'conversation', p_conversation_id,
      case when v_meta ? 'comment_id' then 'forwarded a comment to you'
           when p_kind = 'post' then 'shared a post with you'
           when p_kind = 'shot' then 'shared a Shot with you'
           else 'sent you a message' end);
  end if;
  return json_build_object('id', v_msg.id, 'conversation_id', v_msg.conversation_id, 'sender_id', v_msg.sender_id,
    'body', v_msg.body, 'kind', v_msg.kind, 'post_id', v_msg.post_id, 'shot_id', v_msg.shot_id,
    'reply_to_id', v_msg.reply_to_id, 'is_unsent', v_msg.is_unsent, 'metadata', v_msg.metadata,
    'created_at', v_msg.created_at);
end;
$function$;

revoke all on function public.send_message(uuid, text, text, uuid, uuid, uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.send_message(uuid, text, text, uuid, uuid, uuid, text, jsonb, uuid) to authenticated, service_role;
