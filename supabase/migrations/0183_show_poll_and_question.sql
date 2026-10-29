-- A poll on a Show takes an answer, and a question box takes a reply.
--
-- These are the two layers that make the whole layers-as-data decision
-- worth it: a poll flattened into the picture is a picture of a poll.
--
-- Chat already has polls (0174) and the pure half of the rules —
-- readPoll, barWidth, tidyOptions — is shared rather than copied. The
-- votes are not: message_poll_votes is keyed to a message, and a Show's
-- poll is keyed to a layer inside one row's jsonb.
--
-- **The tally is not written back into `layers`.** Chat keeps its tally
-- in the message's metadata, which is safe because no client can write
-- that column. `shows.layers` is owner-writable by design — that is what
-- lets a Show be edited — so a tally living there would be a number its
-- author could type. It is computed from the votes every time instead.

-- ── Who may see a Show, in one place ───────────────────────────────
--
-- The functions below run as SECURITY DEFINER, because they write to a
-- table the client cannot write to directly. That means RLS does NOT
-- apply inside them: a bare `exists (select 1 from shows where id = ...)`
-- there is true for every Show in the database, expired, private or
-- taken down. Written that way first, it would have let anyone vote on
-- anybody's Show.
--
-- So the rule moves out of the policy and into a function, and the
-- policy is rewritten to call it. One definition, asked by both, rather
-- than a copy in each function that drifts the first time the rule
-- changes — which is exactly what happened to the four hand-copied
-- visibility predicates 0068 replaced with can_see_profile.

create or replace function public.can_see_show(p_show uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $
  select exists (
    select 1 from public.shows s
     where s.id = p_show
       -- taken down
       and (s.removed_at is null or s.user_id = (select auth.uid()) or public.is_admin())
       -- private account
       and (
         s.user_id = (select auth.uid())
         or not exists (
           select 1 from public.profiles p
            where p.id = s.user_id and coalesce(p.is_private, false)
         )
         or exists (
           select 1 from public.follows f
            where f.following_id = s.user_id and f.follower_id = (select auth.uid())
         )
       )
       -- expired, unless it is yours, you are an admin, or it is kept
       -- on a Showcase board
       and (
         s.expires_at > now()
         or s.user_id = (select auth.uid())
         or public.is_admin()
         or exists (
           select 1 from public.showcase_items si
             join public.showcases sc on sc.id = si.showcase_id
            where si.show_id = s.id and si.removed_at is null and sc.removed_at is null
         )
       )
  );
$;

revoke all on function public.can_see_show(uuid) from public;
grant execute on function public.can_see_show(uuid) to anon, authenticated;

-- The policy now asks the same question everything else asks.
alter policy "shows_select_public" on public.shows
  using (public.can_see_show(id));

create table if not exists public.show_poll_votes (
  show_id uuid not null references public.shows(id) on delete cascade,
  -- The layer inside that Show's list. Not a foreign key: layers live in
  -- a jsonb array, and the trigger below is what keeps the two honest.
  layer_id text not null,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  choice int not null check (choice >= 0 and choice < 6),
  created_at timestamptz not null default now(),
  primary key (show_id, layer_id, voter_id)
);

create index if not exists show_poll_votes_voter_idx on public.show_poll_votes (voter_id);

alter table public.show_poll_votes enable row level security;

-- You can see that you answered, and nothing about anybody else. The
-- counts come back from the function, which is the only thing that can
-- see them all — a poll whose individual votes are readable is a poll
-- that tells you how your friends voted.
drop policy if exists "show votes: your own" on public.show_poll_votes;
create policy "show votes: your own" on public.show_poll_votes
  for select using (voter_id = (select auth.uid()));

revoke all on public.show_poll_votes from anon, authenticated;
grant select on public.show_poll_votes to authenticated;

/**
 * Answer a poll on a Show, or take the answer back.
 *
 * Tapping the option you already chose removes it, which is how the
 * chat poll behaves and what a second tap obviously means.
 */
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
  v_tally jsonb;
  v_voters int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  -- RLS does not apply inside a definer function, so visibility is
  -- asked explicitly — of the same function the policy uses.
  if not public.can_see_show(p_show_id) then
    raise exception 'No such Show';
  end if;

  select l into v_layer
    from public.shows s, jsonb_array_elements(s.layers) l
   where s.id = p_show_id
     and l ->> 'id' = p_layer_id
     and l ->> 'type' = 'poll';
  if v_layer is null then raise exception 'No such poll'; end if;

  v_count := jsonb_array_length(coalesce(v_layer -> 'payload' -> 'options', '[]'::jsonb));
  if p_choice is null or p_choice < 0 or p_choice >= v_count then
    raise exception 'No such option';
  end if;

  select true into v_had from public.show_poll_votes
   where show_id = p_show_id and layer_id = p_layer_id
     and voter_id = v_me and choice = p_choice;

  if v_had then
    delete from public.show_poll_votes
     where show_id = p_show_id and layer_id = p_layer_id and voter_id = v_me;
  else
    -- One answer each: the primary key already says so, so this is an
    -- upsert rather than a delete and an insert.
    insert into public.show_poll_votes (show_id, layer_id, voter_id, choice)
    values (p_show_id, p_layer_id, v_me, p_choice)
    on conflict (show_id, layer_id, voter_id)
    do update set choice = excluded.choice, created_at = now();
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

/**
 * Every poll on one Show, counted, plus which option is yours.
 *
 * One call for the whole Show rather than one per poll: a Show may
 * carry several, and the viewer opens them all at once.
 */
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
       where s.id = p_show_id and l ->> 'type' = 'poll'
    ) x;

  return v_out;
end $$;

revoke all on function public.show_poll_tallies(uuid) from public, anon;
grant execute on function public.show_poll_tallies(uuid) to authenticated;

-- ── The question box ────────────────────────────────────────────────

create table if not exists public.show_answers (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  layer_id text not null,
  asker_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (btrim(body) <> '' and char_length(body) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists show_answers_show_idx on public.show_answers (show_id, created_at desc);
create index if not exists show_answers_asker_idx on public.show_answers (asker_id);

alter table public.show_answers enable row level security;

-- The author reads them; so does whoever wrote one, of their own. Nobody
-- else sees who asked what, which is the whole promise of the box.
drop policy if exists "show answers: the author and the asker" on public.show_answers;
create policy "show answers: the author and the asker" on public.show_answers
  for select using (
    asker_id = (select auth.uid())
    or (select auth.uid()) = (select s.user_id from public.shows s where s.id = show_answers.show_id)
  );

revoke all on public.show_answers from anon, authenticated;
grant select on public.show_answers to authenticated;

create or replace function public.answer_show_question(
  p_show_id uuid,
  p_layer_id text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := (select auth.uid());
  v_owner uuid;
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '[\s\u0000-\u001f\u007f]+', ' ', 'g'));
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if v_body = '' then raise exception 'Say something'; end if;
  if char_length(v_body) > 300 then raise exception 'Too long'; end if;

  if not public.can_see_show(p_show_id) then raise exception 'No such Show'; end if;
  select s.user_id into v_owner from public.shows s where s.id = p_show_id;
  if v_owner is null then raise exception 'No such Show'; end if;

  if not exists (
    select 1 from public.shows s, jsonb_array_elements(s.layers) l
     where s.id = p_show_id and l ->> 'id' = p_layer_id and l ->> 'type' = 'question'
  ) then
    raise exception 'No such question';
  end if;

  insert into public.show_answers (show_id, layer_id, asker_id, body)
  values (p_show_id, p_layer_id, v_me, v_body);

  if v_owner <> v_me then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (v_owner, v_me, 'show_answer', 'show', p_show_id, 'answered your Show');
  end if;
end $$;

revoke all on function public.answer_show_question(uuid, text, text) from public, anon;
grant execute on function public.answer_show_question(uuid, text, text) to authenticated;

-- ── A poll that has been answered stops being rewritable ────────────
--
-- 0182 granted update on `layers`, which is what lets a Show be edited
-- after it is posted, and noted this: a vote points at a layer id and a
-- choice index, so an author who edits the options underneath turns
-- somebody's answer into an answer to a different question.
--
-- Taking the poll down entirely is still allowed — it is their Show —
-- and the answers go with it. Only rewriting it is refused.

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
      -- Removed. Their Show, their call; the answers go too.
      delete from public.show_poll_votes where show_id = new.id and layer_id = v_layer;
    elsif (v_old -> 'payload' -> 'options') is distinct from (v_new -> 'payload' -> 'options') then
      raise exception 'A poll that has been answered cannot be rewritten';
    end if;
  end loop;

  return new;
end $$;

revoke execute on function public.tg_shows_keep_answered_polls() from public, anon, authenticated;

drop trigger if exists on_shows_keep_answered_polls on public.shows;
create trigger on_shows_keep_answered_polls before update on public.shows
  for each row execute function public.tg_shows_keep_answered_polls();
