-- Native push device tokens (FCM).
--
-- Separate from push_subscriptions because they are different protocols, not
-- different rows of the same thing: web push is a VAPID endpoint plus two
-- encryption keys and is delivered by the browser's push service, while the
-- native app gets a single opaque FCM registration token delivered by Google.
-- Trying to share one table would mean three nullable columns and a
-- discriminator on every read.
--
-- One user has many devices (phone, tablet, plus their browser), so the token
-- is the key rather than user_id.
create table if not exists public.push_devices (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_devices_user_idx on public.push_devices (user_id);

alter table public.push_devices enable row level security;

-- Mirrors push_subscriptions: a user manages their own devices, and the
-- service-role sender reads across users.
drop policy if exists "push_devices: own select" on public.push_devices;
create policy "push_devices: own select" on public.push_devices
  for select using ((select auth.uid()) = user_id);

drop policy if exists "push_devices: own insert" on public.push_devices;
create policy "push_devices: own insert" on public.push_devices
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "push_devices: own update" on public.push_devices;
create policy "push_devices: own update" on public.push_devices
  for update using ((select auth.uid()) = user_id);

drop policy if exists "push_devices: own delete" on public.push_devices;
create policy "push_devices: own delete" on public.push_devices
  for delete using ((select auth.uid()) = user_id);
