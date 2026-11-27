-- Acts as each person in turn and checks what 0221 lets them read and do.
-- Each t_assert raises on failure, so the run stops at the first one.

\set ON_ERROR_STOP 1
create or replace function public.t_expect_error(sql text, pat text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if sqlerrm !~* pat then raise exception 'wrong error for [%]: % (wanted %)', sql, sqlerrm, pat; end if;
    return;
  end;
  raise exception 'expected error % for [%] but it succeeded', pat, sql;
end $$;
grant execute on function public.t_expect_error(text, text) to authenticated;
create or replace function public.t_assert(ok boolean, what text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAILED: %', what; end if; raise notice 'ok: %', what; end $$;
grant execute on function public.t_assert(boolean, text) to authenticated;
create table public.t_ids (k text primary key, id uuid); grant all on public.t_ids to authenticated;

-- A sends a poll, quiz, slider, question, countdown
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.t_ids select 'poll', (public.send_poll('11111111-1111-1111-1111-111111111111','Where?', array['Pizza','Momos'], false, null)->>'id')::uuid;
insert into public.t_ids select 'quiz', (public.send_dm_sticker('11111111-1111-1111-1111-111111111111','quiz','Which DB?', array['Vercel','Supabase'], 1)->>'id')::uuid;
insert into public.t_ids select 'slider', (public.send_dm_sticker('11111111-1111-1111-1111-111111111111','slider','How hyped?')->>'id')::uuid;
insert into public.t_ids select 'question', (public.send_dm_sticker('11111111-1111-1111-1111-111111111111','question','What first?')->>'id')::uuid;
insert into public.t_ids select 'countdown', (public.send_dm_sticker('11111111-1111-1111-1111-111111111111','countdown','Launch', null, null, now() + interval '4 days')->>'id')::uuid;
select public.t_expect_error($$select public.send_dm_sticker('11111111-1111-1111-1111-111111111111','quiz','Q', array['A','a'], 0)$$, 'different');
select public.t_expect_error($$select public.send_dm_sticker('11111111-1111-1111-1111-111111111111','quiz','Q', array['A','B'], 2)$$, 'right answer');
select public.t_expect_error($$select public.send_dm_sticker('11111111-1111-1111-1111-111111111111','countdown','Q', null, null, now() - interval '1 minute')$$, 'not happened');
select public.t_expect_error($$select public.send_dm_sticker('11111111-1111-1111-1111-111111111111','addyours','Q')$$, 'No such sticker');
select public.t_expect_error($$select public.send_dm_sticker('11111111-1111-1111-1111-111111111111','slider','   ')$$, 'words');
-- the asker cannot answer their own
select public.t_expect_error(format('select public.set_dm_slider(%L, 50)', (select id from t_ids where k='slider')), 'Your own');
select public.t_expect_error(format('select public.answer_dm_quiz(%L, 1)', (select id from t_ids where k='quiz')), 'Your own');
-- the asker votes on their own poll (allowed, as since 0174)
select public.cast_poll_vote((select id from t_ids where k='poll'), 0);

-- B answers everything
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.cast_poll_vote((select id from t_ids where k='poll'), 1);
select public.t_assert((public.answer_dm_quiz((select id from t_ids where k='quiz'), 0)->>'mine')::int = 0, 'quiz answer is recorded');
select public.t_assert((public.answer_dm_quiz((select id from t_ids where k='quiz'), 1)->>'mine')::int = 0, 'a quiz answer is final');
select public.set_dm_slider((select id from t_ids where k='slider'), 80);
select public.answer_dm_question((select id from t_ids where k='question'), 'the frames');
select public.t_expect_error(format('select public.set_dm_slider(%L, 101)', (select id from t_ids where k='slider')), 'range');
select public.t_expect_error(format('select public.answer_dm_quiz(%L, 0)', (select id from t_ids where k='slider')), 'No such sticker');
select public.t_expect_error(format('select public.set_dm_slider(%L, 1)', (select id from t_ids where k='countdown')), 'No such sticker');

-- C answers
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select public.cast_poll_vote((select id from t_ids where k='poll'), 1);
select public.answer_dm_quiz((select id from t_ids where k='quiz'), 1);
select public.set_dm_slider((select id from t_ids where k='slider'), 40);
select public.set_dm_slider((select id from t_ids where k='slider'), 20);
select public.answer_dm_question((select id from t_ids where k='question'), 'first');
select public.answer_dm_question((select id from t_ids where k='question'), 'the themes');

-- C reads: own rows only, no results
select public.t_assert((select count(*) from public.message_poll_votes where message_id = (select id from t_ids where k='poll')) = 1, 'a member reads only their own poll vote rows');
select public.t_assert((select count(*) from public.message_poll_votes) = 2, 'a member reads only their own vote rows across poll and quiz');
select public.t_assert((select count(*) from public.message_sticker_answers) = 2, 'a member reads only their own slider and question answers');
select public.t_assert((select body from public.message_sticker_answers where message_id=(select id from t_ids where k='question')) = 'the themes', 'answering a question again replaces it');
select public.t_assert((select count(*) from public.dm_sticker_results((select id from t_ids where k='poll'))) = 0, 'a member who did not ask gets no names');
select public.t_assert((select count(*) from public.dm_sticker_results((select id from t_ids where k='question'))) = 0, 'a member who did not ask gets no answers');
select public.t_expect_error($$insert into public.message_sticker_answers (message_id, user_id, value) values (gen_random_uuid(), auth.uid(), 1)$$, 'permission denied');
select public.t_expect_error($$insert into public.message_poll_votes (message_id, user_id, choice) values (gen_random_uuid(), auth.uid(), 1)$$, 'permission denied');

-- D, an outsider
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select public.t_expect_error(format('select public.set_dm_slider(%L, 50)', (select id from t_ids where k='slider')), 'Not a member');
select public.t_expect_error($$select public.send_dm_sticker('11111111-1111-1111-1111-111111111111','slider','x')$$, 'Not a member');

-- A, the asker: counts on the message, names through results
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.t_assert((select count(*) from public.message_poll_votes) = 1, 'even the asker reads only their own rows directly');
select public.t_assert((select count(*) from public.dm_sticker_results((select id from t_ids where k='poll'))) = 3, 'the asker sees every poll voter');
select public.t_assert((select count(*) from public.dm_sticker_results((select id from t_ids where k='quiz'))) = 2, 'the asker sees every quiz answer');
select public.t_assert((select string_agg(body, ',' order by body) from public.dm_sticker_results((select id from t_ids where k='question'))) = 'the frames,the themes', 'the asker reads the answers');
select public.t_assert((select string_agg(value::text, ',' order by value) from public.dm_sticker_results((select id from t_ids where k='slider'))) = '20,80', 'the asker sees each slider value');
reset role;
select public.t_assert((select metadata->'tally' = '[1,1]'::jsonb and (metadata->>'voters')::int = 2 from public.messages where id=(select id from t_ids where k='quiz')), 'quiz tally is on the message');
select public.t_assert((select (metadata->>'avg')::int = 50 and (metadata->>'count')::int = 2 from public.messages where id=(select id from t_ids where k='slider')), 'slider average is on the message');
select public.t_assert((select (metadata->>'count')::int = 2 from public.messages where id=(select id from t_ids where k='question')), 'question count is on the message');
select public.t_assert((select metadata->'tally' = '[1,2]'::jsonb from public.messages where id=(select id from t_ids where k='poll')), 'poll tally unchanged by the policy change');
-- a forwarded copy (send_message whitelists metadata, so no sticker key) takes no answers
insert into public.messages (conversation_id, sender_id, body, kind, metadata) values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','fwd','slider','{"forwarded":true}') returning id \gset fwd_
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.t_expect_error(format('select public.set_dm_slider(%L, 50)', :'fwd_id'), 'No such sticker');
-- C leaves; A leaving stops A reading names
reset role;
delete from public.conversation_members where user_id='00000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.t_assert((select count(*) from public.dm_sticker_results((select id from t_ids where k='poll'))) = 0, 'an asker who left reads no names');
select 'ALL CHECKS PASSED';
