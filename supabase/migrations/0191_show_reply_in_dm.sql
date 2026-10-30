-- A reply to a Show carries which Show it answers.
--
-- Replying to a Show sent a DM that began "↩️ Replied to your Show:", and
-- nothing else said which Show — by the time it was read the Show could be
-- one of several, or gone. The message now keeps the Show's id in its
-- metadata, so the chat can draw the Show above the reply and open it.
--
-- Only kept when the sender can see that Show (can_see_show), so the id
-- cannot be used to point a chat at a Show the sender was never shown.
-- Rewritten in full: the function is one body and a replace is the only
-- way to add to it. Everything else is as 0177 left it.

create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text default null::text,
  p_kind text default 'text'::text,
  p_post_id uuid default null::uuid,
  p_reply_to_id uuid default null::uuid,
  p_shot_id uuid default null::uuid,
  p_storage_path text default null::text,
  p_metadata jsonb default null::jsonb,
  p_comment_id uuid default null::uuid
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

  -- Whether this was forwarded. Any kind, because every kind can be: it is
  -- the flag that replaces the words the old client wrote into the body.
  -- Only a real boolean true sets it — a string, a number or a null is a
  -- caller that does not mean it, and a nickname of a flag is still a flag.
  if jsonb_typeof(p_metadata -> 'forwarded') = 'boolean'
     and (p_metadata ->> 'forwarded')::boolean then
    v_meta := v_meta || jsonb_build_object('forwarded', true);
  end if;

  -- A reply to a Show: which Show, when the sender can see it.
  if p_kind = 'text'
     and jsonb_typeof(p_metadata -> 'show_id') = 'string'
     and (p_metadata ->> 'show_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and public.can_see_show((p_metadata ->> 'show_id')::uuid) then
    v_meta := v_meta || jsonb_build_object('show_id', p_metadata ->> 'show_id');
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
