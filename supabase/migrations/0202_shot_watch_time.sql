-- How much of a Shot people actually watch.
--
-- shot_views (0132) answers "did they see it that day" and stops there:
-- one row, written after 1.2 seconds on screen. For short video that is
-- the least interesting question. Whether people watch eight seconds of a
-- nine-second clip or bail at two is what tells an author what to make
-- next, and nothing in the app could answer it.
--
-- ── one row per person per Shot per day ─────────────────────────────────
--
-- The same grain as shot_views, deliberately. An event per session would
-- give retention curves and would also grow without limit for a feed
-- people scroll for an hour; this answers every question the insights
-- screen asks, against a table whose size is bounded by the same thing
-- that bounds shot_views.
--
-- watched_ms and replays accumulate across the day, because total time
-- watched is the honest figure for somebody who came back three times.
-- max_completion takes the best of the day, because "they got to the end"
-- stays true once it has happened.
--
-- ── written through a function, not by the client ───────────────────────
--
-- The client gets no insert or update privilege here at all. Two reasons.
-- A straight upsert from the browser would need a select policy for the
-- row it reads back, which is exactly the trap that broke avatar uploads
-- (0196). And the clamps below belong on the server: watched_ms is a
-- number the client computes, so it is a number the client can be wrong
-- about, and an unbounded integer from a browser has no business landing
-- in a table that feeds somebody's analytics.

create table if not exists public.shot_watch_stats (
  shot_id        uuid not null references public.shots(id) on delete cascade,
  viewer_id      uuid not null references public.profiles(id) on delete cascade,
  watched_on     date not null default current_date,
  -- Total footage played that day. Not wall-clock: a paused or buffering
  -- video keeps the wall running and stops the playhead.
  watched_ms     integer not null default 0,
  -- The clip's own length, so completion can be recomputed later without
  -- trusting that shots.duration_secs never changed.
  duration_ms    integer not null default 0,
  -- Furthest point reached, 0-100. Measured off the playhead rather than
  -- off watched time, so skipping to the end is not "watched it all".
  max_completion smallint not null default 0,
  replays        smallint not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (shot_id, viewer_id, watched_on),
  constraint shot_watch_sane check (
    watched_ms >= 0
    and duration_ms >= 0
    and max_completion between 0 and 100
    and replays >= 0
  )
);

create index if not exists shot_watch_stats_shot_idx
  on public.shot_watch_stats (shot_id);

alter table public.shot_watch_stats enable row level security;

-- Pattern A, as post_views (0043) and shot_views (0132): you can read your
-- own rows, and an author can read the rows about their own Shots. No
-- insert policy, because the client never inserts; no update or delete
-- policy, because a watch is a fact.
drop policy if exists "shot_watch_stats read own or as author" on public.shot_watch_stats;
create policy "shot_watch_stats read own or as author"
  on public.shot_watch_stats for select to authenticated
  using (
    viewer_id = (select auth.uid())
    or exists (
      select 1 from public.shots s
       where s.id = shot_watch_stats.shot_id
         and s.user_id = (select auth.uid())
    )
  );

-- Grants and policies are two separate locks; close both. Supabase hands
-- authenticated a blanket grant on a new table, so revoke before granting
-- the one privilege this table actually wants.
revoke all on public.shot_watch_stats from anon;
revoke all on public.shot_watch_stats from authenticated;
grant select on public.shot_watch_stats to authenticated;

-- ── the write path ──────────────────────────────────────────────────────

create or replace function public.record_shot_watch(
  p_shot_id    uuid,
  p_watched_ms integer,
  p_duration_ms integer,
  p_completion integer,
  p_replays    integer
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := (select auth.uid());
  v_dur integer;
  v_watched integer;
  v_completion smallint;
  v_replays smallint;
begin
  if v_me is null or p_shot_id is null then return; end if;

  -- The Shot has to exist, and watching your own does not count: an author
  -- checking their own reel would otherwise be most of their own watch time.
  if not exists (
    select 1 from public.shots s
     where s.id = p_shot_id and s.user_id <> v_me and s.removed_at is null
  ) then
    return;
  end if;

  -- Clamps. Every one of these is a number the browser computed, so every
  -- one of them is a number the browser can be wrong about. An hour is far
  -- past the 60s a Shot may be, and is the ceiling rather than the rule.
  v_dur       := least(greatest(coalesce(p_duration_ms, 0), 0), 3600000);
  v_watched   := least(greatest(coalesce(p_watched_ms, 0), 0), 3600000);
  v_completion:= least(greatest(coalesce(p_completion, 0), 0), 100)::smallint;
  v_replays   := least(greatest(coalesce(p_replays, 0), 0), 1000)::smallint;

  insert into public.shot_watch_stats as w
    (shot_id, viewer_id, watched_on, watched_ms, duration_ms, max_completion, replays)
  values
    (p_shot_id, v_me, current_date, v_watched, v_dur, v_completion, v_replays)
  on conflict (shot_id, viewer_id, watched_on) do update
    set watched_ms     = least(w.watched_ms + excluded.watched_ms, 3600000),
        duration_ms    = greatest(w.duration_ms, excluded.duration_ms),
        max_completion = greatest(w.max_completion, excluded.max_completion),
        replays        = least(w.replays + excluded.replays, 1000),
        updated_at     = now();
end $$;

revoke all on function public.record_shot_watch(uuid, integer, integer, integer, integer)
  from public, anon;
grant execute on function public.record_shot_watch(uuid, integer, integer, integer, integer)
  to authenticated;

-- ── what the author gets to see ─────────────────────────────────────────
--
-- Pattern C: the gate is in the WHERE, so somebody else's Shot returns a
-- zero row rather than an error. Counts only — who watched how much of
-- what is a level of detail nobody asked for and the sort of thing that
-- is easier not to collect an audience for.
create or replace function public.shot_watch_summary(p_shot_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'watchers',        count(*),
    'avg_completion',  coalesce(round(avg(w.max_completion)), 0),
    'finished',        count(*) filter (where w.max_completion >= 95),
    'total_watch_ms',  coalesce(sum(w.watched_ms), 0),
    'replays',         coalesce(sum(w.replays), 0)
  )
  from public.shot_watch_stats w
  join public.shots s on s.id = w.shot_id
  where w.shot_id = p_shot_id
    and s.user_id = (select auth.uid());
$$;

revoke all on function public.shot_watch_summary(uuid) from public, anon;
grant execute on function public.shot_watch_summary(uuid) to authenticated;
