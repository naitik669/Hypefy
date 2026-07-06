-- Pinned viewers: people whose views the owner wants surfaced first in the
-- Show viewers list. Per-owner and global (applies to all their shows).
create table if not exists public.pinned_viewers (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  pinned_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, pinned_user_id)
);

alter table public.pinned_viewers enable row level security;

drop policy if exists pinned_viewers_owner_all on public.pinned_viewers;
create policy pinned_viewers_owner_all on public.pinned_viewers
  for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
