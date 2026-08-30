-- Spotify connection per user.
--
-- Needed because the Web Playback SDK plays full tracks, and full-track
-- playback is only possible for a signed-in Spotify Premium listener. The
-- app-level Client Credentials token used for search cannot play anything,
-- so each user who wants audio connects their own account.
--
-- Tokens are secrets. RLS is enabled with ZERO policies and the table is
-- revoked from anon/authenticated outright, so PostgREST can never read a
-- row — the same technique app_locks (0031) and rate_events (0026) use.
-- Only the SECURITY DEFINER helpers below, and the service-role routes,
-- ever touch it.
create table if not exists public.spotify_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  -- When the access token dies. Refresh tokens do not expire, but Spotify
  -- may hand back a new one on refresh, so the column is writable.
  expires_at timestamptz not null,
  scope text,
  -- Playback needs Premium. Cached so the UI can explain itself before
  -- attempting playback rather than failing silently at the SDK.
  product text,
  spotify_user_id text,
  display_name text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.spotify_accounts enable row level security;
revoke all on table public.spotify_accounts from anon, authenticated;

-- Does the current user have Spotify connected, and can they play?
-- Returns no token material — only what the UI needs to decide what to show.
create or replace function public.spotify_connection_status()
returns table (connected boolean, is_premium boolean, display_name text)
language sql
security definer
set search_path = public
as $$
  select
    true,
    coalesce(a.product, '') = 'premium',
    a.display_name
  from public.spotify_accounts a
  where a.user_id = auth.uid()
  union all
  select false, false, null::text
  where not exists (
    select 1 from public.spotify_accounts where user_id = auth.uid()
  )
  limit 1;
$$;

revoke all on function public.spotify_connection_status() from public, anon;
grant execute on function public.spotify_connection_status() to authenticated;

-- Disconnect. Deliberately a function rather than a DELETE policy: the table
-- stays unreachable from PostgREST entirely, so there is one door in and one
-- door out.
create or replace function public.disconnect_spotify()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.spotify_accounts where user_id = auth.uid();
$$;

revoke all on function public.disconnect_spotify() from public, anon;
grant execute on function public.disconnect_spotify() to authenticated;
