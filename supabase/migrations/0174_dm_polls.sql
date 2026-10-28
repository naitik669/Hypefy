-- Polls in a conversation.
--
-- "where are we eating" in a group of six is twenty messages and no answer.
-- A poll is a message like any other — it threads, it quotes, it can be
-- unsent — with a question in `body` and its options in `metadata`.
--
-- Two places hold state, on purpose:
--
--   message_poll_votes  who chose what. The truth, and what lets somebody
--                       change their mind and see their own choice ticked.
--   messages.metadata   the tally. A cache, recomputed from the table on
--                       every vote rather than incremented, so it cannot
--                       drift; and because the thread is already listening
--                       for message UPDATEs, writing it there is how every
--                       member's screen learns the new count with no new
--                       subscription and no extra read.
--
-- Votes are not secret. Members of the conversation can read the rows, so a
-- group can see who is in for Friday. That is the feature, not an oversight
-- — a poll in a chat of six people was never going to be a secret ballot,
-- and pretending otherwise would be the dishonest option.

create table if not exists public.message_poll_votes (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Bounded here as well as in the function: the column should not be able
  -- to hold a choice no poll can offer, whatever writes it.
  choice smallint not null check (choice >= 0 and choice < 6),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, choice)
);

alter table public.message_poll_votes enable row level security;

drop policy if exists poll_votes_read on public.message_poll_votes;
create policy poll_votes_read on public.message_poll_votes
  for select using (
    public.is_conv_member(
      (select m.conversation_id from public.messages m where m.id = message_id)
    )
  );

-- No write path but the function below. A client that could insert its own
-- rows could vote as somebody else, or vote for an option that does not
-- exist, and the tally in metadata would faithfully report it.
revoke all on table public.message_poll_votes from anon, authenticated;
grant select on table public.message_poll_votes to authenticated;

/**
 * Put a poll in a conversation.
 *
 * Separate from send_message because send_message deliberately keeps a
 * whitelist of the metadata a caller may set — a poll's options have to be
 * checked, trimmed and bounded, and widening that whitelist to let any
 * caller write any shape into metadata would undo the reason it is there.
 */
create or replace function public.send_poll(
  p_conversation_id uuid,
  p_question text,
  p_options text[],
  p_multi boolean default false,
  p_reply_to_id uuid default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
  v_clean text[] := '{}';
  v_seen text[] := '{}';
  v_one text;
  v_msg public.messages%rowtype;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.is_conv_member(p_conversation_id) then raise exception 'Not a member'; end if;

  if p_question is null or btrim(p_question) = '' then
    raise exception 'A poll needs a question';
  end if;
  if char_length(btrim(p_question)) > 200 then
    raise exception 'That question is too long';
  end if;

  -- Trimmed, blanks dropped, duplicates dropped. Two options that read the
  -- same are a tally nobody can act on — and "Pizza" against "pizza" reads
  -- the same, so the comparison ignores case while the option keeps the
  -- capitals whoever typed it first gave it.
  foreach v_one in array coalesce(p_options, '{}') loop
    v_one := btrim(v_one);
    if v_one <> '' and char_length(v_one) <= 60 and not (lower(v_one) = any (v_seen)) then
      v_clean := v_clean || v_one;
      v_seen := v_seen || lower(v_one);
    end if;
  end loop;

  if array_length(v_clean, 1) is null or array_length(v_clean, 1) < 2 then
    raise exception 'A poll needs at least two options';
  end if;
  if array_length(v_clean, 1) > 6 then
    raise exception 'A poll takes at most six options';
  end if;

  -- Mirrors send_message: somebody who has blocked you does not receive a
  -- poll from you either.
  if exists (
    select 1 from public.conversation_members cm
    join public.blocked_users b on b.blocker_id = cm.user_id and b.blocked_id = v_me
    where cm.conversation_id = p_conversation_id and cm.user_id <> v_me
  ) then
    raise exception 'blocked';
  end if;

  insert into public.messages (conversation_id, sender_id, body, kind, reply_to_id, metadata)
  values (
    p_conversation_id, v_me, btrim(p_question), 'poll', p_reply_to_id,
    jsonb_build_object(
      'options', to_jsonb(v_clean),
      'multi', coalesce(p_multi, false),
      'tally', (select jsonb_agg(0) from generate_series(1, array_length(v_clean, 1))),
      'voters', 0
    )
  )
  returning * into v_msg;

  update public.conversations
     set last_message_at = now(), last_message_id = v_msg.id, updated_at = now()
   where id = p_conversation_id;

  return json_build_object(
    'id', v_msg.id, 'conversation_id', v_msg.conversation_id, 'sender_id', v_msg.sender_id,
    'body', v_msg.body, 'kind', v_msg.kind, 'reply_to_id', v_msg.reply_to_id,
    'is_unsent', v_msg.is_unsent, 'metadata', v_msg.metadata, 'created_at', v_msg.created_at
  );
end $$;

revoke all on function public.send_poll(uuid, text, text[], boolean, uuid) from anon;
grant execute on function public.send_poll(uuid, text, text[], boolean, uuid) to authenticated;

/**
 * Choose an option, or take the choice back.
 *
 * One function for both because a vote is a toggle: pressing the option you
 * already chose unchooses it, which is the only way out of a poll you
 * answered by accident.
 *
 * On a single-choice poll, choosing one clears the others — the alternative
 * is a refusal, which would mean changing your mind took two presses and a
 * guess about which one to undo first.
 */
create or replace function public.cast_poll_vote(p_message_id uuid, p_choice int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
  v_conv uuid;
  v_meta jsonb;
  v_count int;
  v_multi boolean;
  v_had boolean;
  v_tally jsonb;
  v_voters int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  select m.conversation_id, m.metadata into v_conv, v_meta
    from public.messages m
   where m.id = p_message_id and m.kind = 'poll' and not m.is_unsent and m.removed_at is null;
  if v_conv is null then raise exception 'No such poll'; end if;
  if not public.is_conv_member(v_conv) then raise exception 'Not a member'; end if;

  v_count := jsonb_array_length(coalesce(v_meta -> 'options', '[]'::jsonb));
  -- Bounded by this poll's own options, not by the column's check: option 4
  -- of a three-option poll is a vote for nothing, and would show up in the
  -- tally as a voter nobody can account for.
  if p_choice is null or p_choice < 0 or p_choice >= v_count then
    raise exception 'No such option';
  end if;

  v_multi := coalesce((v_meta ->> 'multi')::boolean, false);

  select true into v_had from public.message_poll_votes
   where message_id = p_message_id and user_id = v_me and choice = p_choice;

  if v_had then
    delete from public.message_poll_votes
     where message_id = p_message_id and user_id = v_me and choice = p_choice;
  else
    if not v_multi then
      delete from public.message_poll_votes
       where message_id = p_message_id and user_id = v_me;
    end if;
    insert into public.message_poll_votes (message_id, user_id, choice)
    values (p_message_id, v_me, p_choice)
    on conflict do nothing;
  end if;

  -- Recomputed, never incremented: a cache that is derived fresh each time
  -- cannot drift away from the rows it summarises.
  select jsonb_agg(c.n order by c.i) into v_tally
    from (
      select g.i,
             (select count(*) from public.message_poll_votes v
               where v.message_id = p_message_id and v.choice = g.i) as n
        from generate_series(0, v_count - 1) as g(i)
    ) c;
  select count(distinct user_id) into v_voters
    from public.message_poll_votes where message_id = p_message_id;

  update public.messages
     set metadata = metadata || jsonb_build_object('tally', v_tally, 'voters', v_voters)
   where id = p_message_id;

  return jsonb_build_object('tally', v_tally, 'voters', v_voters);
end $$;

revoke all on function public.cast_poll_vote(uuid, int) from anon;
grant execute on function public.cast_poll_vote(uuid, int) to authenticated;
