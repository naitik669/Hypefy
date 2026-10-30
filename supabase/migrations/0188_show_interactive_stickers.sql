-- Four stickers that do something: Quiz, Hype slider, Countdown, Add yours.
--
-- The layers themselves live in shows.layers like every other one; what
-- needs a table is what viewers do with them. Every write goes through a
-- SECURITY DEFINER function that asks can_see_show first — the same rule
-- the poll functions in 0183 follow — and checks the layer really is the
-- kind it is being treated as.

-- ── Quiz: a poll with one right answer ─────────────────────────────
--
-- Votes go in show_poll_votes like a poll's. Two differences: an answer
-- is final (a quiz you could change after seeing the right one is not a
-- quiz), and the right answer, like the options, cannot be rewritten
-- once somebody has answered.

create or replace function public.cast_show_vote(
  p_show_id uuid,
  p_layer_id text,
  p_choice int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := (select auth.uid());
  v_layer jsonb;
  v_count int;
  v_had boolean;
  v_answered boolean;
  v_tally jsonb;
  v_voters int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  if not public.can_see_show(p_show_id) then
    raise exception 'No such Show';
  end if;

  select l into v_layer
    from public.shows s, jsonb_array_elements(s.layers) l
   where s.id = p_show_id
     and l ->> 'id' = p_layer_id
     and l ->> 'type' in ('poll', 'quiz');
  if v_layer is null then raise exception 'No such poll'; end if;

  v_count := jsonb_array_length(coalesce(v_layer -> 'payload' -> 'options', '[]'::jsonb));
  if p_choice is null or p_choice < 0 or p_choice >= v_count then
    raise exception 'No such option';
  end if;

  select true into v_answered from public.show_poll_votes
   where show_id = p_show_id and layer_id = p_layer_id and voter_id = v_me;

  if v_layer ->> 'type' = 'quiz' and v_answered then
    -- Already answered: the answer stands, and the counts come back as they are.
    null;
  else
    select true into v_had from public.show_poll_votes
     where show_id = p_show_id and layer_id = p_layer_id
       and voter_id = v_me and choice = p_choice;

    if v_had then
      delete from public.show_poll_votes
       where show_id = p_show_id and layer_id = p_layer_id and voter_id = v_me;
    else
      insert into public.show_poll_votes (show_id, layer_id, voter_id, choice)
      values (p_show_id, p_layer_id, v_me, p_choice)
      on conflict (show_id, layer_id, voter_id)
      do update set choice = excluded.choice, created_at = now();
    end if;
  end if;

  select jsonb_agg(c.n order by c.i) into v_tally
    from (
      select g.i,
             (select count(*) from public.show_poll_votes v
               where v.show_id = p_show_id and v.layer_id = p_layer_id and v.choice = g.i) as n
        from generate_series(0, v_count - 1) as g(i)
    ) c;
  select count(*) into v_voters
    from public.show_poll_votes where show_id = p_show_id and layer_id = p_layer_id;

  return jsonb_build_object('tally', v_tally, 'voters', v_voters);
end $$;

revoke all on function public.cast_show_vote(uuid, text, int) from public, anon;
grant execute on function public.cast_show_vote(uuid, text, int) to authenticated;

create or replace function public.show_poll_tallies(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_me uuid := (select auth.uid()); v_out jsonb;
begin
  if not public.can_see_show(p_show_id) then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_object_agg(x.layer_id, x.state), '{}'::jsonb) into v_out
    from (
      select l ->> 'id' as layer_id,
             jsonb_build_object(
               'tally', (
                 select coalesce(jsonb_agg(c.n order by c.i), '[]'::jsonb)
                   from (
                     select g.i,
                            (select count(*) from public.show_poll_votes v
                              where v.show_id = p_show_id
                                and v.layer_id = l ->> 'id'
                                and v.choice = g.i) as n
                       from generate_series(
                         0,
                         greatest(jsonb_array_length(coalesce(l -> 'payload' -> 'options', '[]'::jsonb)) - 1, 0)
                       ) as g(i)
                   ) c
               ),
               'voters', (
                 select count(*) from public.show_poll_votes v
                  where v.show_id = p_show_id and v.layer_id = l ->> 'id'
               ),
               'mine', (
                 select v.choice from public.show_poll_votes v
                  where v.show_id = p_show_id and v.layer_id = l ->> 'id' and v.voter_id = v_me
               )
             ) as state
        from public.shows s, jsonb_array_elements(s.layers) l
       where s.id = p_show_id and l ->> 'type' in ('poll', 'quiz')
    ) x;

  return v_out;
end $$;

revoke all on function public.show_poll_tallies(uuid) from public, anon;
grant execute on function public.show_poll_tallies(uuid) to authenticated;

create or replace function public.tg_shows_keep_answered_polls()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_layer text;
  v_old jsonb;
  v_new jsonb;
begin
  if new.layers is not distinct from old.layers then return new; end if;

  for v_layer in
    select distinct layer_id from public.show_poll_votes where show_id = new.id
  loop
    select l into v_old from jsonb_array_elements(old.layers) l where l ->> 'id' = v_layer;
    select l into v_new from jsonb_array_elements(new.layers) l where l ->> 'id' = v_layer;

    if v_new is null then
      delete from public.show_poll_votes where show_id = new.id and layer_id = v_layer;
    elsif (v_old -> 'payload' -> 'options') is distinct from (v_new -> 'payload' -> 'options')
       or (v_old -> 'payload' -> 'answer') is distinct from (v_new -> 'payload' -> 'answer') then
      raise exception 'A poll that has been answered cannot be rewritten';
    end if;
  end loop;

  return new;
end $$;

revoke execute on function public.tg_shows_keep_answered_polls() from public, anon, authenticated;

-- ── Hype slider ─────────────────────────────────────────────────────

create table if not exists public.show_slider_votes (
  show_id uuid not null references public.shows(id) on delete cascade,
  layer_id text not null check (char_length(layer_id) between 1 and 64),
  voter_id uuid not null references public.profiles(id) on delete cascade,
  value smallint not null check (value between 0 and 100),
  created_at timestamptz not null default now(),
  primary key (show_id, layer_id, voter_id)
);

create index if not exists show_slider_votes_voter_idx on public.show_slider_votes (voter_id);

alter table public.show_slider_votes enable row level security;
-- No direct reads or writes: everything goes through the functions below,
-- which know who may see what.
revoke all on public.show_slider_votes from anon, authenticated;

/** Slide: how hyped you are, 0–100. Sliding again changes it. Not on your own Show. */
create or replace function public.set_show_slider(p_show_id uuid, p_layer_id text, p_value int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := (select auth.uid());
  v_author uuid;
  v_ok boolean;
  v_avg numeric;
  v_n int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.can_see_show(p_show_id) then raise exception 'No such Show'; end if;
  if p_value is null or p_value < 0 or p_value > 100 then raise exception 'Out of range'; end if;

  select s.user_id, exists (
           select 1 from jsonb_array_elements(s.layers) l
            where l ->> 'id' = p_layer_id and l ->> 'type' = 'slider')
    into v_author, v_ok
    from public.shows s where s.id = p_show_id;
  if not coalesce(v_ok, false) then raise exception 'No such slider'; end if;
  if v_author = v_me then raise exception 'Your own slider is for everyone else'; end if;

  insert into public.show_slider_votes (show_id, layer_id, voter_id, value)
  values (p_show_id, p_layer_id, v_me, p_value)
  on conflict (show_id, layer_id, voter_id)
  do update set value = excluded.value, created_at = now();

  select avg(value), count(*) into v_avg, v_n
    from public.show_slider_votes where show_id = p_show_id and layer_id = p_layer_id;

  return jsonb_build_object('avg', round(coalesce(v_avg, 0)), 'count', v_n);
end $$;

revoke all on function public.set_show_slider(uuid, text, int) from public, anon;
grant execute on function public.set_show_slider(uuid, text, int) to authenticated;

/** Who slid, and how far. The Show's author only. */
create or replace function public.show_slider_voters(p_show_id uuid, p_layer_id text)
returns table (user_id uuid, username text, display_name text, avatar_url text, avatar_hue int, value smallint)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.avatar_hue, v.value
    from public.show_slider_votes v
    join public.shows s on s.id = v.show_id
    join public.profiles p on p.id = v.voter_id
   where v.show_id = p_show_id
     and v.layer_id = p_layer_id
     and s.user_id = (select auth.uid())
   order by v.value desc, v.created_at desc
   limit 200;
$$;

revoke all on function public.show_slider_voters(uuid, text) from public, anon;
grant execute on function public.show_slider_voters(uuid, text) to authenticated;

-- ── Countdown ───────────────────────────────────────────────────────

create table if not exists public.show_countdown_reminders (
  show_id uuid not null references public.shows(id) on delete cascade,
  layer_id text not null check (char_length(layer_id) between 1 and 64),
  user_id uuid not null references public.profiles(id) on delete cascade,
  remind_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (show_id, layer_id, user_id)
);

create index if not exists show_countdown_reminders_due_idx
  on public.show_countdown_reminders (remind_at) where sent_at is null;
create index if not exists show_countdown_reminders_user_idx on public.show_countdown_reminders (user_id);

alter table public.show_countdown_reminders enable row level security;
revoke all on public.show_countdown_reminders from anon, authenticated;

/** Remind me, or don't any more. Returns whether a reminder is now set. */
create or replace function public.toggle_countdown_reminder(p_show_id uuid, p_layer_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := (select auth.uid());
  v_at timestamptz;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.can_see_show(p_show_id) then raise exception 'No such Show'; end if;

  select (l -> 'payload' ->> 'at')::timestamptz into v_at
    from public.shows s, jsonb_array_elements(s.layers) l
   where s.id = p_show_id and l ->> 'id' = p_layer_id and l ->> 'type' = 'countdown';
  if v_at is null then raise exception 'No such countdown'; end if;

  if exists (select 1 from public.show_countdown_reminders
              where show_id = p_show_id and layer_id = p_layer_id and user_id = v_me) then
    delete from public.show_countdown_reminders
     where show_id = p_show_id and layer_id = p_layer_id and user_id = v_me;
    return false;
  end if;

  if v_at <= now() then raise exception 'That has already happened'; end if;

  insert into public.show_countdown_reminders (show_id, layer_id, user_id, remind_at)
  values (p_show_id, p_layer_id, v_me, v_at);
  return true;
end $$;

revoke all on function public.toggle_countdown_reminder(uuid, text) from public, anon;
grant execute on function public.toggle_countdown_reminder(uuid, text) to authenticated;

/**
 * Tell everyone who asked, once the moment comes.
 *
 * A normal notification from the Show's author, which reaches a phone the
 * way every other one does. Run every minute, like scheduled messages.
 */
create or replace function public.deliver_countdown_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  with due as (
    select r.show_id, r.layer_id, r.user_id
      from public.show_countdown_reminders r
     where r.sent_at is null and r.remind_at <= now()
     order by r.remind_at
     limit 500
     for update skip locked
  ), told as (
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    select d.user_id, s.user_id, 'show_countdown', 'show', d.show_id,
           left(coalesce(nullif(btrim(l -> 'payload' ->> 'title'), ''), 'The countdown') || ' is happening now', 200)
      from due d
      join public.shows s on s.id = d.show_id
      join lateral jsonb_array_elements(s.layers) l on l ->> 'id' = d.layer_id
    returning 1
  )
  update public.show_countdown_reminders r
     set sent_at = now()
    from due d
   where r.show_id = d.show_id and r.layer_id = d.layer_id and r.user_id = d.user_id;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.deliver_countdown_reminders() from public, anon, authenticated;

select cron.unschedule('deliver-countdown-reminders')
 where exists (select 1 from cron.job where jobname = 'deliver-countdown-reminders');
select cron.schedule('deliver-countdown-reminders', '* * * * *', 'select public.deliver_countdown_reminders();');

-- ── Add yours ───────────────────────────────────────────────────────

/**
 * Join the shared Show behind an Add yours prompt, so you can post into it.
 *
 * The layer names the collab, but a layer is whatever its author's client
 * wrote. So the collab has to belong to the Show's author — otherwise a
 * crafted sticker would be a key to somebody else's private shared Show.
 */
create or replace function public.join_add_yours(p_show_id uuid, p_layer_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := (select auth.uid());
  v_collab uuid;
  v_members int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.can_see_show(p_show_id) then raise exception 'No such Show'; end if;

  select c.id into v_collab
    from public.shows s
    join lateral jsonb_array_elements(s.layers) l on l ->> 'id' = p_layer_id and l ->> 'type' = 'addyours'
    join public.show_collabs c
      on c.id::text = l -> 'payload' ->> 'collabId'
     and c.owner_id = s.user_id
     and c.removed_at is null
   where s.id = p_show_id;
  if v_collab is null then raise exception 'No such prompt'; end if;

  if public.in_show_collab(v_collab, v_me) then return v_collab; end if;

  select count(*) into v_members
    from public.show_collab_members where collab_id = v_collab and joined_at is not null;
  if v_members >= public.show_collab_cap() then raise exception 'This prompt is full'; end if;

  insert into public.show_collab_members (collab_id, user_id, invited_by, joined_at)
  values (v_collab, v_me, v_me, now())
  on conflict (collab_id, user_id) do update set joined_at = coalesce(public.show_collab_members.joined_at, now());

  return v_collab;
end $$;

revoke all on function public.join_add_yours(uuid, text) from public, anon;
grant execute on function public.join_add_yours(uuid, text) to authenticated;

-- ── Everything a viewer needs for these, in one call ───────────────

create or replace function public.show_sticker_state(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := (select auth.uid());
  v_sliders jsonb;
  v_reminders jsonb;
  v_added jsonb;
begin
  if not public.can_see_show(p_show_id) then return '{}'::jsonb; end if;

  select coalesce(jsonb_object_agg(l ->> 'id', jsonb_build_object(
           'avg', (select round(coalesce(avg(v.value), 0)) from public.show_slider_votes v
                    where v.show_id = p_show_id and v.layer_id = l ->> 'id'),
           'count', (select count(*) from public.show_slider_votes v
                      where v.show_id = p_show_id and v.layer_id = l ->> 'id'),
           'mine', (select v.value from public.show_slider_votes v
                     where v.show_id = p_show_id and v.layer_id = l ->> 'id' and v.voter_id = v_me)
         )), '{}'::jsonb)
    into v_sliders
    from public.shows s, jsonb_array_elements(s.layers) l
   where s.id = p_show_id and l ->> 'type' = 'slider';

  select coalesce(jsonb_agg(r.layer_id), '[]'::jsonb) into v_reminders
    from public.show_countdown_reminders r
   where r.show_id = p_show_id and r.user_id = v_me;

  select coalesce(jsonb_object_agg(l ->> 'id', (
           select count(*) from public.shows x
            where x.collab_id::text = l -> 'payload' ->> 'collabId'
              and x.expires_at > now() and x.removed_at is null)), '{}'::jsonb)
    into v_added
    from public.shows s, jsonb_array_elements(s.layers) l
   where s.id = p_show_id and l ->> 'type' = 'addyours';

  return jsonb_build_object('sliders', v_sliders, 'reminders', v_reminders, 'added', v_added);
end $$;

revoke all on function public.show_sticker_state(uuid) from public, anon;
grant execute on function public.show_sticker_state(uuid) to authenticated;
