-- Sharing, done properly: who is suggested, groups among them, and which
-- slide of a post was the one that was shared.

-- ── 1. send_message remembers the slide ─────────────────────────────────
--
-- Sharing the third photo of a post sent the post, and the chat showed the
-- first. The message had nowhere to say which one. It goes in metadata, and
-- only that: metadata also carries claim_oneshot's own fields, so the client
-- is never allowed to write the column freely — this function takes a slide
-- number for a post and builds the object itself.
--
-- Dropped and recreated rather than overloaded: two send_message functions
-- differing only in a trailing default would make every named-argument call
-- ambiguous. Every caller uses named arguments, so adding one changes nothing
-- for them.

drop function if exists public.send_message(uuid, text, text, uuid, uuid, uuid, text);

create function public.send_message(
  p_conversation_id uuid,
  p_body text default null,
  p_kind text default 'text',
  p_post_id uuid default null,
  p_reply_to_id uuid default null,
  p_shot_id uuid default null,
  p_storage_path text default null,
  p_metadata jsonb default null
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
      case when p_kind = 'post' then 'shared a post with you'
           when p_kind = 'shot' then 'shared a Shot with you'
           else 'sent you a message' end);
  end if;
  return json_build_object('id', v_msg.id, 'conversation_id', v_msg.conversation_id, 'sender_id', v_msg.sender_id,
    'body', v_msg.body, 'kind', v_msg.kind, 'post_id', v_msg.post_id, 'shot_id', v_msg.shot_id,
    'reply_to_id', v_msg.reply_to_id, 'is_unsent', v_msg.is_unsent, 'metadata', v_msg.metadata,
    'created_at', v_msg.created_at);
end;
$function$;

-- Same grants as before: signed-in people only.
revoke all on function public.send_message(uuid, text, text, uuid, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.send_message(uuid, text, text, uuid, uuid, uuid, text, jsonb) to authenticated, service_role;


-- ── 2. Who the share sheet suggests ─────────────────────────────────────
--
-- The sheet used to list everyone you follow and everyone who follows you,
-- ordered only by what kind of connection it was. A follower you have never
-- spoken to sat in the list beside your closest friend, and the order within
-- each kind was whatever the database returned.
--
-- Now a person is suggested because of something that happened between you,
-- and ranked by how much, recently:
--
--   relationship_strength (0108) ..... hypes, comments, saves, rehypes both
--                                      ways and your one-to-one chat, each
--                                      fading over 60 days to a floor of 0.3
--   things you have shared with them . 6 each, fading over 180 days — the
--                                      strongest signal of who you send to
--   on your close-friends list ....... +2, and kept even with nothing else,
--                                      since you chose them yourself
--
-- Someone you follow but have never interacted with is not suggested. They
-- are still found by searching.
--
-- Group chats are suggested too, ranked the same way: by how recently the
-- group was active (5, fading over 60 days, as a one-to-one chat is) and by
-- what you have shared there (6 each, fading over 180 days).

create or replace function public.share_suggestions(p_limit integer default 40)
returns table (
  kind text,
  id uuid,
  name text,
  username text,
  avatar_hue integer,
  avatar_url text,
  members integer,
  score numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with me as (select auth.uid() as uid),
  blocked as (
    select b.blocked_id as uid from blocked_users b where b.blocker_id = (select uid from me)
    union
    select b.blocker_id from blocked_users b where b.blocked_id = (select uid from me)
  ),
  candidates as (
    select other.user_id as uid
      from conversation_members mine
      join conversations c on c.id = mine.conversation_id and c.type <> 'group'
      join conversation_members other on other.conversation_id = c.id and other.user_id <> mine.user_id
     where mine.user_id = (select uid from me)
    union
    select friend_id from close_friends where user_id = (select uid from me)
    union
    select following_id from follows where follower_id = (select uid from me)
    union
    select follower_id from follows where following_id = (select uid from me)
  ),
  strength as (
    select rs.user_id as uid, rs.strength
      from relationship_strength((select array_agg(uid) from candidates), 60) rs
  ),
  shared_people as (
    select other.user_id as uid,
           sum(6.0 * greatest(0.3, 1 - extract(epoch from now() - m.created_at) / 86400.0 / 180)) as pts
      from messages m
      join conversations c on c.id = m.conversation_id and c.type <> 'group'
      join conversation_members other on other.conversation_id = c.id and other.user_id <> (select uid from me)
     where m.sender_id = (select uid from me)
       and m.kind in ('post', 'shot')
       and m.created_at > now() - interval '180 days'
     group by other.user_id
  ),
  people as (
    select 'person'::text as kind, p.id, coalesce(p.display_name, p.username) as name, p.username,
           p.avatar_hue, p.avatar_url, null::integer as members,
           round((coalesce(s.strength, 0) + coalesce(sp.pts, 0)
                  + case when cf.friend_id is not null then 2 else 0 end)::numeric, 3) as score
      from candidates cand
      join profiles p on p.id = cand.uid and p.profile_completed
      left join strength s on s.uid = cand.uid
      left join shared_people sp on sp.uid = cand.uid
      left join close_friends cf on cf.user_id = (select uid from me) and cf.friend_id = cand.uid
     where cand.uid <> (select uid from me)
       and cand.uid not in (select uid from blocked)
       and (coalesce(s.strength, 0) > 0 or coalesce(sp.pts, 0) > 0 or cf.friend_id is not null)
  ),
  my_groups as (
    select c.id, c.title, c.avatar_url, c.last_message_at
      from conversation_members mine
      join conversations c on c.id = mine.conversation_id and c.type = 'group'
     where mine.user_id = (select uid from me)
       and c.last_message_at > now() - interval '90 days'
  ),
  groups as (
    select 'group'::text as kind, g.id,
           coalesce(nullif(btrim(g.title), ''),
                    (select string_agg(coalesce(pp.display_name, pp.username), ', ' order by pp.display_name)
                       from (select pr.display_name, pr.username
                               from conversation_members cm
                               join profiles pr on pr.id = cm.user_id
                              where cm.conversation_id = g.id and cm.user_id <> (select uid from me)
                              limit 3) pp)) as name,
           null::text as username,
           null::integer as avatar_hue,
           g.avatar_url,
           (select count(*)::int from conversation_members cm where cm.conversation_id = g.id) as members,
           round((5.0 * greatest(0.3, 1 - extract(epoch from now() - g.last_message_at) / 86400.0 / 60)
                  + coalesce((select sum(6.0 * greatest(0.3, 1 - extract(epoch from now() - m.created_at) / 86400.0 / 180))
                                from messages m
                               where m.conversation_id = g.id
                                 and m.sender_id = (select uid from me)
                                 and m.kind in ('post', 'shot')
                                 and m.created_at > now() - interval '180 days'), 0))::numeric, 3) as score
      from my_groups g
  )
  select * from (select * from people union all select * from groups) everything
   order by score desc, name nulls last
   limit greatest(least(p_limit, 100), 0);
$function$;

revoke all on function public.share_suggestions(integer) from public, anon;
grant execute on function public.share_suggestions(integer) to authenticated, service_role;

comment on function public.share_suggestions(integer) is
  'People and group chats to suggest in the share sheet, ranked by real interaction: relationship_strength, past shares, close friends, and group activity. People with no interaction are left out; they are found by search.';
