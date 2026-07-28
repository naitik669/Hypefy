-- Schema-drift fix: the `favorites` table (a user's favourited people, powering
-- the Favourite feed tab + the Hyper/Favorite button) exists in prod and in the
-- generated database.types.ts, but was never captured as a migration — so a
-- clean `supabase db reset` produced a DB where every Favourites query threw
-- "relation does not exist". This recreates it exactly as it lives in prod.
-- Idempotent guards make it a no-op against the existing prod table.

create table if not exists public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);

create index if not exists favorites_user_id_idx on public.favorites(user_id);

alter table public.favorites enable row level security;
drop policy if exists favorites_owner_all on public.favorites;
create policy favorites_owner_all on public.favorites
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
