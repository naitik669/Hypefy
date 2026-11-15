-- A Show can last 48 hours instead of 24.
--
-- expires_at has always been `now() + 24 hours`, written by the column
-- default and never by anybody: shows grants per column, and authenticated
-- has SELECT on expires_at and no INSERT or UPDATE at all. So the lifetime
-- was not a choice because there was no way to express one.
--
-- ── the client picks hours, not a timestamp ─────────────────────────────
--
-- Granting INSERT on expires_at would be the short way and the wrong one:
-- a timestamp from a browser is a timestamp a browser can be wrong about,
-- and a Show set to expire in ten years is a Show that never expires. The
-- reaper would never take it and can_see_show would go on returning true.
--
-- So the client writes lifetime_hours, which is bounded by a CHECK to the
-- two values the composer offers, and a trigger computes expires_at from
-- it. The clamp cannot be skipped by writing the other column, because the
-- other column still cannot be written.
--
-- Named "for now" in the composer's own words: more lengths are a CHECK
-- and a dropdown entry away, and nothing else has to move.

alter table public.shows
  add column if not exists lifetime_hours smallint not null default 24;

alter table public.shows
  drop constraint if exists shows_lifetime_known;
alter table public.shows
  add constraint shows_lifetime_known check (lifetime_hours in (24, 48));

-- Insert only. A Show's lifetime is decided when it is posted, like its
-- audience: letting it be updated afterwards would mean a Show that had
-- expired coming back, which can_see_show and the reaper both have views
-- about.
grant select (lifetime_hours) on public.shows to anon, authenticated;
grant insert (lifetime_hours) on public.shows to authenticated;

-- ── the expiry is computed, never accepted ──────────────────────────────

create or replace function public.tg_shows_expiry_from_lifetime()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Not for the service role, which backfills and repairs rows and has no
  -- business having its timestamps overwritten. The same exemption
  -- tg_profiles_preserve_privileged makes, for the same reason.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  new.expires_at := now() + make_interval(hours => coalesce(new.lifetime_hours, 24));
  return new;
end $$;

drop trigger if exists shows_expiry_from_lifetime on public.shows;
create trigger shows_expiry_from_lifetime
  before insert on public.shows
  for each row execute function public.tg_shows_expiry_from_lifetime();
