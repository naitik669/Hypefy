-- Sounds you keep, and sounds that are being used.
--
-- A sound has a page now (0123). Two things it could not do: be kept for
-- later, and be found without already knowing its name.
--
--   saved_sounds      a person's own shelf. The song is stored whole, as it
--                     is everywhere else, so the shelf still works after the
--                     Shot it was found on is gone.
--   trending_sounds   the songs and original audio used most in the last
--                     30 days, counted only from public accounts and from
--                     content that is still up.
--
-- "Original audio" needs nothing here: it is an ordinary song record whose
-- id is original-<shot id> and whose audio is that Shot's own file.

create table if not exists public.saved_sounds (
  user_id uuid not null references public.profiles(id) on delete cascade,
  track_id text not null check (length(track_id) between 1 and 128),
  track jsonb not null check (track->>'id' = track_id and pg_column_size(track) < 4000),
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);
alter table public.saved_sounds enable row level security;
drop policy if exists "saved_sounds: own read" on public.saved_sounds;
create policy "saved_sounds: own read" on public.saved_sounds
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "saved_sounds: own insert" on public.saved_sounds;
create policy "saved_sounds: own insert" on public.saved_sounds
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "saved_sounds: own delete" on public.saved_sounds;
create policy "saved_sounds: own delete" on public.saved_sounds
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.saved_sounds from anon, authenticated;
grant select, insert, delete on public.saved_sounds to authenticated;

create or replace function public.trending_sounds(p_limit int default 20)
returns table (track jsonb, uses int)
language sql stable security definer set search_path = public as $$
  with used as (
    select s.track, s.created_at
      from public.shots s join public.profiles p on p.id = s.user_id
     where s.track is not null and s.removed_at is null
       and not coalesce(p.is_private, false)
       and s.created_at > now() - interval '30 days'
    union all
    select o.track, o.created_at
      from public.posts o join public.profiles p on p.id = o.user_id
     where o.track is not null and o.removed_at is null
       and not coalesce(p.is_private, false)
       and o.created_at > now() - interval '30 days'
  )
  -- The newest use speaks for the song. Its snippet start was one person's
  -- choice for their own Shot, so it is left out.
  select (array_agg(u.track order by u.created_at desc))[1] - 'start', count(*)::int
    from used u
   where coalesce(u.track->>'id', '') <> ''
   group by u.track->>'id'
   order by count(*) desc, max(u.created_at) desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke all on function public.trending_sounds(int) from public, anon;
grant execute on function public.trending_sounds(int) to authenticated;
