-- Being named in a group chat tells you.
--
-- The composer has had @ autocomplete since 0133, and nothing came of it:
-- `notifications` knew mention_post and mention_shot, so you could name
-- somebody in a group of eight and they would find out only by reading.
--
-- Groups only, deliberately. In a one-to-one there is nobody to single out
-- and the other person is already told about the message itself, so a
-- mention there is a second ping for one event. And a one-to-one body is an
-- envelope: the server cannot read it, which is the point of sealing it.
--
-- No new target_type. 'conversation' already routes to /messages/<id> in the
-- notifications list, so the notification lands in the thread it is about.
-- No new preference either: 0022 maps every mention_% to the 'mentions' key,
-- and its BEFORE INSERT trigger drops the row for anyone who turned those
-- off before this one existed.

create or replace function public.handle_message_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle text;
  v_target uuid;
begin
  -- A notice the thread wrote about itself has no author to name anyone.
  if new.kind = 'system' or new.body is null or btrim(new.body) = '' then
    return new;
  end if;

  if not exists (
    select 1 from public.conversations c
     where c.id = new.conversation_id and c.type = 'group'
  ) then
    return new;
  end if;

  -- A sealed body is an envelope of JSON and base64. Hunting @handles
  -- through one would invent mentions nobody wrote, so anything shaped
  -- like an envelope is left alone. Groups are never sealed today; this
  -- is here for the day that changes, and costs one character test.
  if left(btrim(new.body), 1) = '{' then
    return new;
  end if;

  -- The same handles the composer would have found: @ followed by
  -- letters, digits, underscore or dot, lowercased. Kept in step with
  -- extractMentions in src/lib/content-utils.ts.
  for v_handle in
    select distinct lower(m[1])
      from regexp_matches(new.body, '@([a-zA-Z0-9_.]+)', 'g') as m
  loop
    -- Only someone actually in the room. You cannot name a stranger into
    -- a group, and a notification about a thread you cannot open is worse
    -- than none. Muted means muted: the point of muting a group is not
    -- hearing from it.
    select p.id into v_target
      from public.profiles p
      join public.conversation_members cm
        on cm.user_id = p.id
       and cm.conversation_id = new.conversation_id
     where lower(p.username) = v_handle
       and p.id <> new.sender_id
       and cm.muted_at is null
       and not exists (
         select 1 from public.blocked_users b
          where (b.blocker_id = p.id and b.blocked_id = new.sender_id)
             or (b.blocker_id = new.sender_id and b.blocked_id = p.id)
       );

    if v_target is not null and public.mention_allowed(v_target, new.sender_id) then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (
        v_target, new.sender_id, 'mention_message', 'conversation',
        new.conversation_id, 'mentioned you in a chat'
      );
    end if;

    v_target := null;
  end loop;

  return new;
end $$;

revoke all on function public.handle_message_mentions() from public, anon, authenticated;

-- A trigger rather than a line in send_message: scheduled messages arrive
-- through deliver_due_messages instead, and being named in one you wrote
-- last week should tell somebody just the same.
drop trigger if exists tg_messages_mentions on public.messages;
create trigger tg_messages_mentions
after insert on public.messages
for each row execute function public.handle_message_mentions();
