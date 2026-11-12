-- Show stickers: the server-side half of making them all work.
--
-- Four things, and one new reader for the results sheet.
--
-- 1. A crafted layer could take down every sticker on its own Show.
--    `show_poll_tallies` and `cast_show_vote` both do
--    `jsonb_array_length(coalesce(l -> 'payload' -> 'options', '[]'))`, and
--    jsonb_array_length throws on anything that is not an array. The client is
--    the only validator by design (0182), and the client is not the only way
--    in: a scalar `options` on one layer failed the whole call, so a Show with
--    a poll, a quiz and a countdown lost all three. Fixed with a helper that
--    answers 0 instead of raising, and the same for a countdown's `at`.
--
-- 2. One viewer could answer a question any number of times. `show_answers`
--    had no uniqueness, so each answer was another row and another
--    notification to the author. Now one row each, edited in place, and only a
--    genuinely new answer notifies.
--
--    THIS DELETES DATA, and cannot be undone: where somebody answered twice,
--    only their newest answer survives. That is the intent, and it is stated
--    here because it is irreversible.
--
-- 3. The author could vote in their own poll and quiz. `set_show_slider` has
--    always refused them; these two did not, so an author's own vote counted
--    in their own results.
--
-- 4. None of the sticker RPCs were rate limited. Answers were the live
--    problem, each one writing a notification row.
--
-- 5. `show_sticker_results` is new: who voted, answered, slid, set a reminder
--    or joined, for the Show's author alone. The viewer-facing calls
--    (`show_poll_tallies`, `show_sticker_state`) never learn a name, which is
--    the whole arrangement — the owner sees who, viewers see totals.
--
-- Safe to apply at any point. Everything is additive or `create or replace`,
-- the function signatures are unchanged, and a client from before this
-- ignores the new shapes.

-- ── helpers ──────────────────────────────────────────────────────────────

/**
 * A timestamp from text, or null where it is not one.
 *
 * `(l -> 'payload' ->> 'at')::timestamptz` raises on a payload nobody
 * validated, and a raise here is a sticker call that fails rather than a
 * sticker that is ignored.
 */
create or replace function public.safe_timestamptz(p text)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $fn$
begin
  return p::timestamptz;
exception when others then
  return null;
end;
$fn$;

/** How many options a poll or quiz layer has, and 0 for anything malformed. */
create or replace function public.show_options_len(p_layer jsonb)
returns int
language sql
immutable
set search_path = public
as $fn$
  select case
    when jsonb_typeof(p_layer -> 'payload' -> 'options') = 'array'
      then jsonb_array_length(p_layer -> 'payload' -> 'options')
    else 0
  end;
$fn$;

/**
 * One layer of a Show by id, if it is there and is one of `p_types` and
 * carries an object payload. Replaces the `jsonb_array_elements … where
 * l ->> 'id' = …` block that each of these functions had its own copy of.
 */
create or replace function public.show_layer(p_show uuid, p_layer text, p_types text[])
returns jsonb
language sql
stable
set search_path = public
as $fn$
  select l
    from public.shows s, jsonb_array_elements(s.layers) l
   where s.id = p_show
     and l ->> 'id' = p_layer
     and l ->> 'type' = any (p_types)
     and jsonb_typeof(l -> 'payload') = 'object'
   limit 1;
$fn$;

revoke all on function public.safe_timestamptz(text) from public, anon;
revoke all on function public.show_options_len(jsonb) from public, anon;
revoke all on function public.show_layer(uuid, text, text[]) from public, anon;

-- ── one answer each, edited in place ─────────────────────────────────────

-- Keep each asker's newest answer per question and drop the rest. Irreversible.
delete from public.show_answers a
 using public.show_answers b
 where a.show_id = b.show_id
   and a.layer_id = b.layer_id
   and a.asker_id = b.asker_id
   and (a.created_at, a.id) < (b.created_at, b.id);

create unique index if not exists show_answers_one_each
  on public.show_answers (show_id, layer_id, asker_id);

-- The other sticker tables bound their layer id; this one did not.
alter table public.show_answers
  drop constraint if exists show_answers_layer_id_len;
alter table public.show_answers
  add constraint show_answers_layer_id_len
  check (char_length(layer_id) between 1 and 64);

create or replace function public.answer_show_question(p_show_id uuid, p_layer_id text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_me uuid := (select auth.uid());
  v_owner uuid;
  v_fresh boolean;
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '[\s\u0000-\u001f\u007f]+', ' ', 'g'));
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if v_body = '' then raise exception 'Say something'; end if;
  if char_length(v_body) > 300 then raise exception 'Too long'; end if;
  if not public.can_see_show(p_show_id) then raise exception 'No such Show'; end if;

  select s.user_id into v_owner from public.shows s where s.id = p_show_id;
  if v_owner is null then raise exception 'No such Show'; end if;
  if v_owner = v_me then raise exception 'Your own question is for everyone else'; end if;

  if public.show_layer(p_show_id, p_layer_id, array['question']) is null then
    raise exception 'No such question';
  end if;

  -- Generous: twenty answers an hour is far more than anyone writes, and it
  -- is the one sticker call that creates a notification row per use.
  perform public.rate_limit('show_answer', 20, interval '1 hour');

  insert into public.show_answers (show_id, layer_id, asker_id, body)
  values (p_show_id, p_layer_id, v_me, v_body)
  on conflict (show_id, layer_id, asker_id)
    do update set body = excluded.body, created_at = now()
  returning (xmax = 0) into v_fresh;

  -- Only a first answer is news. Rewriting one is not worth telling them
  -- about again, and before the unique index above it told them every time.
  if coalesce(v_fresh, false) then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (v_owner, v_me, 'show_answer', 'show', p_show_id, 'answered your Show');
  end if;
end;
$fn$;

-- ── a vote, guarded ─────────────────────────────────────────────────────

create or replace function public.cast_show_vote(p_show_id uuid, p_layer_id text, p_choice integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_me uuid := (select auth.uid());
  v_author uuid;
  v_layer jsonb;
  v_count int;
  v_had boolean;
  v_answered boolean;
  v_tally jsonb;
  v_voters int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.can_see_show(p_show_id) then raise exception 'No such Show'; end if;

  v_layer := public.show_layer(p_show_id, p_layer_id, array['poll', 'quiz']);
  if v_layer is null then raise exception 'No such poll'; end if;

  select s.user_id into v_author from public.shows s where s.id = p_show_id;
  -- Matches set_show_slider's wording, and the client's own guard.
  if v_author = v_me then raise exception 'Your own poll is for everyone else'; end if;

  -- 0 for a malformed options list, so a crafted layer reads as "no such
  -- option" rather than failing the call.
  v_count := public.show_options_len(v_layer);
  if p_choice is null or p_choice < 0 or p_choice >= v_count then raise exception 'No such option'; end if;

  perform public.rate_limit('show_vote', 120, interval '1 hour');

  select true into v_answered from public.show_poll_votes
   where show_id = p_show_id and layer_id = p_layer_id and voter_id = v_me;

  if v_layer ->> 'type' = 'quiz' and v_answered then
    -- A quiz answer is final.
    null;
  else
    select true into v_had from public.show_poll_votes
     where show_id = p_show_id and layer_id = p_layer_id and voter_id = v_me and choice = p_choice;
    if v_had then
      -- Tapping the one you chose takes it back.
      delete from public.show_poll_votes
       where show_id = p_show_id and layer_id = p_layer_id and voter_id = v_me;
    else
      insert into public.show_poll_votes (show_id, layer_id, voter_id, choice)
      values (p_show_id, p_layer_id, v_me, p_choice)
      on conflict (show_id, layer_id, voter_id) do update set choice = excluded.choice, created_at = now();
    end if;
  end if;

  select jsonb_agg(c.n order by c.i) into v_tally
    from (
      select g.i,
             (select count(*) from public.show_poll_votes v
               where v.show_id = p_show_id and v.layer_id = p_layer_id and v.choice = g.i) as n
        from generate_series(0, v_count - 1) as g(i)
    ) c;
  select count(*) into v_voters from public.show_poll_votes
   where show_id = p_show_id and layer_id = p_layer_id;
  return jsonb_build_object('tally', v_tally, 'voters', v_voters);
end;
$fn$;

create or replace function public.show_poll_tallies(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare v_me uuid := (select auth.uid()); v_out jsonb;
begin
  if not public.can_see_show(p_show_id) then return '{}'::jsonb; end if;
  select coalesce(jsonb_object_agg(x.layer_id, x.state), '{}'::jsonb) into v_out
    from (
      select l ->> 'id' as layer_id,
             jsonb_build_object(
               'tally', (select coalesce(jsonb_agg(c.n order by c.i), '[]'::jsonb) from (
                   select g.i,
                          (select count(*) from public.show_poll_votes v
                            where v.show_id = p_show_id and v.layer_id = l ->> 'id' and v.choice = g.i) as n
                     -- show_options_len, not jsonb_array_length: one layer
                     -- with a scalar `options` used to fail this for all of
                     -- them.
                     from generate_series(0, greatest(public.show_options_len(l) - 1, 0)) as g(i)) c),
               'voters', (select count(*) from public.show_poll_votes v
                           where v.show_id = p_show_id and v.layer_id = l ->> 'id'),
               'mine', (select v.choice from public.show_poll_votes v
                         where v.show_id = p_show_id and v.layer_id = l ->> 'id' and v.voter_id = v_me)
             ) as state
        from public.shows s, jsonb_array_elements(s.layers) l
       where s.id = p_show_id and l ->> 'type' in ('poll', 'quiz')
    ) x;
  return v_out;
end;
$fn$;

-- ── the slider and the countdown ────────────────────────────────────────

create or replace function public.set_show_slider(p_show_id uuid, p_layer_id text, p_value integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare v_me uuid := (select auth.uid()); v_author uuid; v_ok boolean; v_avg numeric; v_n int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.can_see_show(p_show_id) then raise exception 'No such Show'; end if;
  if p_value is null or p_value < 0 or p_value > 100 then raise exception 'Out of range'; end if;
  select s.user_id into v_author from public.shows s where s.id = p_show_id;
  v_ok := public.show_layer(p_show_id, p_layer_id, array['slider']) is not null;
  if not coalesce(v_ok, false) then raise exception 'No such slider'; end if;
  if v_author = v_me then raise exception 'Your own slider is for everyone else'; end if;

  -- A slider is dragged, so this is per release and not per pixel; 120 an
  -- hour leaves room to change your mind repeatedly.
  perform public.rate_limit('show_slider', 120, interval '1 hour');

  insert into public.show_slider_votes (show_id, layer_id, voter_id, value)
  values (p_show_id, p_layer_id, v_me, p_value)
  on conflict (show_id, layer_id, voter_id) do update set value = excluded.value, created_at = now();
  select avg(value), count(*) into v_avg, v_n from public.show_slider_votes
   where show_id = p_show_id and layer_id = p_layer_id;
  return jsonb_build_object('avg', round(coalesce(v_avg, 0)), 'count', v_n);
end;
$fn$;

create or replace function public.toggle_countdown_reminder(p_show_id uuid, p_layer_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare v_me uuid := (select auth.uid()); v_layer jsonb; v_at timestamptz;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.can_see_show(p_show_id) then raise exception 'No such Show'; end if;

  v_layer := public.show_layer(p_show_id, p_layer_id, array['countdown']);
  -- safe_timestamptz, not a cast: a crafted `at` used to raise out of here.
  v_at := public.safe_timestamptz(v_layer -> 'payload' ->> 'at');
  if v_at is null then raise exception 'No such countdown'; end if;

  if exists (select 1 from public.show_countdown_reminders
              where show_id = p_show_id and layer_id = p_layer_id and user_id = v_me) then
    delete from public.show_countdown_reminders
     where show_id = p_show_id and layer_id = p_layer_id and user_id = v_me;
    return false;
  end if;

  if v_at <= now() then raise exception 'That has already happened'; end if;
  perform public.rate_limit('show_reminder', 60, interval '1 hour');
  insert into public.show_countdown_reminders (show_id, layer_id, user_id, remind_at)
  values (p_show_id, p_layer_id, v_me, v_at);
  return true;
end;
$fn$;

-- ── what a viewer knows, plus their own answer ──────────────────────────

create or replace function public.show_sticker_state(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare v_me uuid := (select auth.uid()); v_sliders jsonb; v_reminders jsonb; v_added jsonb; v_answers jsonb;
begin
  if not public.can_see_show(p_show_id) then return '{}'::jsonb; end if;

  select coalesce(jsonb_object_agg(l ->> 'id', jsonb_build_object(
           'avg', (select round(coalesce(avg(v.value), 0)) from public.show_slider_votes v
                    where v.show_id = p_show_id and v.layer_id = l ->> 'id'),
           'count', (select count(*) from public.show_slider_votes v
                      where v.show_id = p_show_id and v.layer_id = l ->> 'id'),
           'mine', (select v.value from public.show_slider_votes v
                     where v.show_id = p_show_id and v.layer_id = l ->> 'id' and v.voter_id = v_me))), '{}'::jsonb)
    into v_sliders from public.shows s, jsonb_array_elements(s.layers) l
   where s.id = p_show_id and l ->> 'type' = 'slider';

  select coalesce(jsonb_agg(r.layer_id), '[]'::jsonb) into v_reminders
    from public.show_countdown_reminders r where r.show_id = p_show_id and r.user_id = v_me;

  select coalesce(jsonb_object_agg(l ->> 'id',
           (select count(*) from public.shows x
             where x.collab_id::text = l -> 'payload' ->> 'collabId'
               and x.expires_at > now() and x.removed_at is null)), '{}'::jsonb)
    into v_added from public.shows s, jsonb_array_elements(s.layers) l
   where s.id = p_show_id and l ->> 'type' = 'addyours';

  -- Your own answers, so the box comes back filled instead of looking
  -- untouched. One call where the client had to make a second one.
  select coalesce(jsonb_object_agg(a.layer_id, a.body), '{}'::jsonb) into v_answers
    from public.show_answers a where a.show_id = p_show_id and a.asker_id = v_me;

  return jsonb_build_object(
    'sliders', v_sliders, 'reminders', v_reminders, 'added', v_added, 'answers', v_answers);
end;
$fn$;

-- ── who did it, for the author alone ────────────────────────────────────

/**
 * Everyone who touched an interactive sticker on your Show.
 *
 * Author only, gated the same way `show_slider_voters` is. Nothing in here
 * ever reaches a viewer: `show_poll_tallies` and `show_sticker_state` return
 * counts and your own answer, and no name at all.
 *
 * Keyed by layer id, and only for layers still on the Show, so answers and
 * votes left behind by a sticker that was taken off do not appear here — the
 * answers screen shows those under their own heading instead.
 */
create or replace function public.show_sticker_results(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare v_me uuid := (select auth.uid()); v_out jsonb;
begin
  if v_me is null then return '{}'::jsonb; end if;
  if not exists (select 1 from public.shows where id = p_show_id and user_id = v_me) then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_object_agg(x.id, x.body), '{}'::jsonb) into v_out
    from (
      select l ->> 'id' as id,
             jsonb_build_object('kind', l ->> 'type', 'people', coalesce(p.people, '[]'::jsonb)) as body
        from public.shows s, jsonb_array_elements(s.layers) l
        left join lateral (
          select jsonb_agg(row_to_json(r)::jsonb order by r.at desc nulls last) as people
            from (
              -- A poll or a quiz: what each person chose.
              select pr.id, pr.username, pr.display_name, pr.avatar_url, pr.avatar_hue,
                     v.choice as value, null::text as body, v.created_at as at
                from public.show_poll_votes v
                join public.profiles pr on pr.id = v.voter_id
               where l ->> 'type' in ('poll', 'quiz')
                 and v.show_id = p_show_id and v.layer_id = l ->> 'id'
              union all
              -- A hype slider: how hyped.
              select pr.id, pr.username, pr.display_name, pr.avatar_url, pr.avatar_hue,
                     sv.value, null::text, sv.created_at
                from public.show_slider_votes sv
                join public.profiles pr on pr.id = sv.voter_id
               where l ->> 'type' = 'slider'
                 and sv.show_id = p_show_id and sv.layer_id = l ->> 'id'
              union all
              -- A countdown: who is waiting for it.
              select pr.id, pr.username, pr.display_name, pr.avatar_url, pr.avatar_hue,
                     null::int, null::text, cr.created_at
                from public.show_countdown_reminders cr
                join public.profiles pr on pr.id = cr.user_id
               where l ->> 'type' = 'countdown'
                 and cr.show_id = p_show_id and cr.layer_id = l ->> 'id'
              union all
              -- A question: what they wrote.
              select pr.id, pr.username, pr.display_name, pr.avatar_url, pr.avatar_hue,
                     null::int, an.body, an.created_at
                from public.show_answers an
                join public.profiles pr on pr.id = an.asker_id
               where l ->> 'type' = 'question'
                 and an.show_id = p_show_id and an.layer_id = l ->> 'id'
              union all
              -- Add yours: who joined. Only a collab that is genuinely this
              -- author's, the same rule join_add_yours enforces, so a crafted
              -- collabId cannot read somebody else's members.
              select pr.id, pr.username, pr.display_name, pr.avatar_url, pr.avatar_hue,
                     null::int, null::text, cm.joined_at
                from public.show_collab_members cm
                join public.show_collabs c on c.id = cm.collab_id
                join public.profiles pr on pr.id = cm.user_id
               where l ->> 'type' = 'addyours'
                 and c.id::text = l -> 'payload' ->> 'collabId'
                 and c.owner_id = v_me
              limit 200
            ) r
        ) p on true
       where s.id = p_show_id
         and l ->> 'type' in ('poll', 'quiz', 'slider', 'countdown', 'question', 'addyours')
    ) x;

  return v_out;
end;
$fn$;

revoke all on function public.show_sticker_results(uuid) from public, anon;
grant execute on function public.show_sticker_results(uuid) to authenticated;
