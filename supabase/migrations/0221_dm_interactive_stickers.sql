-- Interactive stickers in a conversation: quiz, hype slider, question and
-- countdown, ported from Shows (0183, 0188, 0194) — and one rule for who
-- sees an answer, wherever the sticker is.
--
-- The rule (design D5 B, 27 Nov 2026): counts for everyone, names only for
-- whoever asked. That is what a Show has always done — viewers see the
-- tallies, the author sees the names (show_slider_voters, the results sheet
-- in 0194) — so Shows do not change here.
--
-- DM polls do. 0174 let every member read every member's vote rows, on
-- purpose. This takes that away: a member reads their own rows and nobody
-- else's, and the person who sent the poll reads the names through
-- dm_sticker_results below. When this was written the live database held
-- no poll messages and no votes at all (checked 27 Nov 2026), so nothing
-- anybody did is being re-hidden after the fact.
--
-- Shape, the same one 0174 chose for polls:
--   messages.body       the question, prompt or title.
--   messages.metadata   what the card needs: the options, the counts. The
--                       counts are a cache recomputed from the rows on each
--                       answer, and written onto the message because the
--                       thread already listens for message UPDATEs — that is
--                       how everyone's card learns the new count.
--   the rows            who answered what. Readable by the person who wrote
--                       them, and through dm_sticker_results by the sender.
--
-- `metadata.sticker` carries the kind, and every answer function asks for
-- it. send_message (0191, and 0220 after it) lets a caller pass any kind but
-- whitelists metadata, so a forwarded quiz arrives as kind 'quiz' with no
-- options and no `sticker` key: the thread draws it as its question in a
-- plain bubble, and nothing here will take answers on it.

-- ── Poll votes are your own ───────────────────────────────────────────

drop policy if exists poll_votes_read on public.message_poll_votes;
drop policy if exists poll_votes_read_own on public.message_poll_votes;
create policy poll_votes_read_own on public.message_poll_votes
  for select using (user_id = (select auth.uid()));

-- ── Slider values and question answers ────────────────────────────────

create table if not exists public.message_sticker_answers (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- A slider's 0–100, or a question's words. Exactly one of the two.
  value smallint check (value between 0 and 100),
  body text check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id),
  check (num_nonnulls(value, body) = 1)
);

create index if not exists message_sticker_answers_user_idx
  on public.message_sticker_answers (user_id);

alter table public.message_sticker_answers enable row level security;

drop policy if exists sticker_answers_read_own on public.message_sticker_answers;
create policy sticker_answers_read_own on public.message_sticker_answers
  for select using (user_id = (select auth.uid()));

-- No write path but the functions below.
revoke all on table public.message_sticker_answers from anon, authenticated;
grant select on table public.message_sticker_answers to authenticated;

-- ── Sending one ───────────────────────────────────────────────────────

/**
 * Put a quiz, a hype slider, a question or a countdown in a conversation.
 *
 * One function for the four, because they differ only in what metadata
 * starts as. The bounds are the Show stickers' (show-layers.ts): a question
 * of 200 characters, two to six options of 60, a countdown title of 60.
 */
create or replace function public.send_dm_sticker(
  p_conversation_id uuid,
  p_kind text,
  p_text text,
  p_options text[] default null,
  p_answer int default null,
  p_at timestamptz default null,
  p_reply_to_id uuid default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
  v_text text := btrim(coalesce(p_text, ''));
  v_clean text[] := '{}';
  v_seen text[] := '{}';
  v_one text;
  v_meta jsonb;
  v_msg public.messages%rowtype;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.is_conv_member(p_conversation_id) then raise exception 'Not a member'; end if;
  if p_kind is null or p_kind not in ('quiz', 'slider', 'question', 'countdown') then
    raise exception 'No such sticker';
  end if;

  if v_text = '' then raise exception 'It needs some words'; end if;
  if char_length(v_text) > (case when p_kind = 'countdown' then 60 else 200 end) then
    raise exception 'That is too long';
  end if;

  if p_kind = 'quiz' then
    foreach v_one in array coalesce(p_options, '{}') loop
      v_one := btrim(v_one);
      if v_one = '' or char_length(v_one) > 60 or lower(v_one) = any (v_seen) then
        -- Not dropped quietly, as send_poll does: the answer is an index,
        -- and a dropped option would move it onto a different one.
        raise exception 'Each answer needs to be different, and at most 60 characters';
      end if;
      v_clean := v_clean || v_one;
      v_seen := v_seen || lower(v_one);
    end loop;
    if coalesce(array_length(v_clean, 1), 0) < 2 then raise exception 'A quiz needs at least two answers'; end if;
    if array_length(v_clean, 1) > 6 then raise exception 'A quiz takes at most six answers'; end if;
    if p_answer is null or p_answer < 0 or p_answer >= array_length(v_clean, 1) then
      raise exception 'Mark the right answer';
    end if;
    v_meta := jsonb_build_object(
      'sticker', 'quiz',
      'options', to_jsonb(v_clean),
      'answer', p_answer,
      'tally', (select jsonb_agg(0) from generate_series(1, array_length(v_clean, 1))),
      'voters', 0
    );
  elsif p_kind = 'slider' then
    v_meta := jsonb_build_object('sticker', 'slider', 'avg', 0, 'count', 0);
  elsif p_kind = 'question' then
    v_meta := jsonb_build_object('sticker', 'question', 'count', 0);
  else
    if p_at is null or p_at <= now() then raise exception 'Pick a time that has not happened yet'; end if;
    if p_at > now() + interval '366 days' then raise exception 'Pick a time within a year'; end if;
    v_meta := jsonb_build_object('sticker', 'countdown', 'at', p_at);
  end if;

  -- Mirrors send_message and send_poll.
  if exists (
    select 1 from public.conversation_members cm
    join public.blocked_users b on b.blocker_id = cm.user_id and b.blocked_id = v_me
    where cm.conversation_id = p_conversation_id and cm.user_id <> v_me
  ) then
    raise exception 'blocked';
  end if;

  perform public.rate_limit('dm_sticker_send', 60, interval '1 hour');

  insert into public.messages (conversation_id, sender_id, body, kind, reply_to_id, metadata)
  values (p_conversation_id, v_me, v_text, p_kind, p_reply_to_id, v_meta)
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

revoke all on function public.send_dm_sticker(uuid, text, text, text[], int, timestamptz, uuid) from public, anon;
grant execute on function public.send_dm_sticker(uuid, text, text, text[], int, timestamptz, uuid) to authenticated;

/**
 * The sticker a caller may answer: a live message of this kind in a
 * conversation they are in, that somebody else sent. Raises otherwise.
 *
 * Not your own, as on a Show (set_show_slider: "your own slider is for
 * everyone else"): an asker answering their own quiz or slider is a vote
 * that only moves the average they are about to read.
 */
create or replace function public.dm_sticker_target(p_message_id uuid, p_kind text)
returns public.messages
language plpgsql stable security definer set search_path = public as $$
declare
  v_msg public.messages%rowtype;
begin
  select * into v_msg from public.messages m
   where m.id = p_message_id and m.kind = p_kind and m.metadata ->> 'sticker' = p_kind
     and not m.is_unsent and m.removed_at is null;
  if v_msg.id is null then raise exception 'No such sticker'; end if;
  if not public.is_conv_member(v_msg.conversation_id) then raise exception 'Not a member'; end if;
  if v_msg.sender_id = (select auth.uid()) then raise exception 'Your own sticker is for everyone else'; end if;
  return v_msg;
end $$;

revoke all on function public.dm_sticker_target(uuid, text) from public, anon, authenticated;

-- ── Answering ─────────────────────────────────────────────────────────

/**
 * Answer a quiz. Final: a quiz you could change after seeing the right one
 * is not a quiz (the same rule cast_show_vote keeps). Answering again
 * changes nothing and returns the counts as they are.
 */
create or replace function public.answer_dm_quiz(p_message_id uuid, p_choice int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
  v_msg public.messages%rowtype;
  v_count int;
  v_tally jsonb;
  v_voters int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  v_msg := public.dm_sticker_target(p_message_id, 'quiz');
  v_count := jsonb_array_length(coalesce(v_msg.metadata -> 'options', '[]'::jsonb));
  if p_choice is null or p_choice < 0 or p_choice >= v_count then raise exception 'No such option'; end if;

  if not exists (select 1 from public.message_poll_votes where message_id = p_message_id and user_id = v_me) then
    perform public.rate_limit('dm_sticker_answer', 120, interval '1 hour');
    insert into public.message_poll_votes (message_id, user_id, choice) values (p_message_id, v_me, p_choice);

    select jsonb_agg(c.n order by c.i) into v_tally
      from (select g.i, (select count(*) from public.message_poll_votes v
                          where v.message_id = p_message_id and v.choice = g.i) as n
              from generate_series(0, v_count - 1) as g(i)) c;
    select count(distinct user_id) into v_voters from public.message_poll_votes where message_id = p_message_id;
    update public.messages
       set metadata = metadata || jsonb_build_object('tally', v_tally, 'voters', v_voters)
     where id = p_message_id
     returning metadata into v_msg.metadata;
  end if;

  return jsonb_build_object(
    'tally', v_msg.metadata -> 'tally',
    'voters', v_msg.metadata -> 'voters',
    'mine', (select choice from public.message_poll_votes where message_id = p_message_id and user_id = v_me limit 1)
  );
end $$;

revoke all on function public.answer_dm_quiz(uuid, int) from public, anon;
grant execute on function public.answer_dm_quiz(uuid, int) to authenticated;

/** Slide: 0–100. Sliding again changes it. */
create or replace function public.set_dm_slider(p_message_id uuid, p_value int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
  v_avg numeric;
  v_n int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  perform public.dm_sticker_target(p_message_id, 'slider');
  if p_value is null or p_value < 0 or p_value > 100 then raise exception 'Out of range'; end if;
  perform public.rate_limit('dm_sticker_answer', 120, interval '1 hour');

  insert into public.message_sticker_answers (message_id, user_id, value)
  values (p_message_id, v_me, p_value)
  on conflict (message_id, user_id) do update set value = excluded.value, created_at = now();

  select round(coalesce(avg(value), 0)), count(*) into v_avg, v_n
    from public.message_sticker_answers where message_id = p_message_id;
  update public.messages
     set metadata = metadata || jsonb_build_object('avg', v_avg, 'count', v_n)
   where id = p_message_id;

  return jsonb_build_object('avg', v_avg, 'count', v_n);
end $$;

revoke all on function public.set_dm_slider(uuid, int) from public, anon;
grant execute on function public.set_dm_slider(uuid, int) to authenticated;

/** Answer a question. Only the asker reads it; answering again replaces it. */
create or replace function public.answer_dm_question(p_message_id uuid, p_body text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_n int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  perform public.dm_sticker_target(p_message_id, 'question');
  if v_body = '' then raise exception 'Write an answer first'; end if;
  if char_length(v_body) > 500 then raise exception 'That answer is too long'; end if;
  perform public.rate_limit('dm_sticker_answer', 120, interval '1 hour');

  insert into public.message_sticker_answers (message_id, user_id, body)
  values (p_message_id, v_me, v_body)
  on conflict (message_id, user_id) do update set body = excluded.body, created_at = now();

  select count(*) into v_n from public.message_sticker_answers where message_id = p_message_id;
  update public.messages set metadata = metadata || jsonb_build_object('count', v_n) where id = p_message_id;

  return jsonb_build_object('count', v_n);
end $$;

revoke all on function public.answer_dm_question(uuid, text) from public, anon;
grant execute on function public.answer_dm_question(uuid, text) to authenticated;

-- ── Who answered: the asker only ──────────────────────────────────────

/**
 * Every answer to a poll, quiz, slider or question, with who gave it — for
 * the person who sent it, and nobody else. Anyone else gets no rows, the
 * same answer show_slider_voters gives a viewer who is not the author.
 *
 * Still a member: somebody who has left the group does not keep reading
 * who in it answered what.
 */
create or replace function public.dm_sticker_results(p_message_id uuid)
returns table (
  user_id uuid, username text, display_name text, avatar_url text, avatar_hue int,
  choices smallint[], value smallint, body text, answered_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with target as (
    select m.id from public.messages m
     where m.id = p_message_id
       and m.sender_id = (select auth.uid())
       and m.kind in ('poll', 'quiz', 'slider', 'question')
       and not m.is_unsent and m.removed_at is null
       and public.is_conv_member(m.conversation_id)
  ), answers as (
    select v.user_id, array_agg(v.choice order by v.choice) as choices,
           null::smallint as value, null::text as body, max(v.created_at) as answered_at
      from public.message_poll_votes v join target t on t.id = v.message_id
     group by v.user_id
    union all
    select a.user_id, null, a.value, a.body, a.created_at
      from public.message_sticker_answers a join target t on t.id = a.message_id
  )
  select p.id, p.username, p.display_name, p.avatar_url, p.avatar_hue,
         a.choices, a.value, a.body, a.answered_at
    from answers a join public.profiles p on p.id = a.user_id
   order by a.answered_at desc
   limit 500;
$$;

revoke all on function public.dm_sticker_results(uuid) from public, anon;
grant execute on function public.dm_sticker_results(uuid) to authenticated;
