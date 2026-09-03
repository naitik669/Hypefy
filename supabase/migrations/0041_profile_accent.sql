-- Per-user accent colour for profile surfaces.
--
-- Additive and defaulted, so every existing row keeps the brand lime and no
-- surface changes until someone deliberately picks something else.
--
-- No CHECK on the value, matching card_theme in 0039: the id set lives in
-- src/lib/profile-accent.ts and unknown ids fall back to lime at read time,
-- so adding a colour stays a deploy rather than a migration. The only guard
-- is a length bound, which keeps the column from being used as free text.
--
-- No new policy needed — the existing owner-update policy on profiles already
-- covers the column, and profiles are publicly readable.

alter table public.profiles
  add column if not exists accent_id text not null default 'lime';

alter table public.profiles
  drop constraint if exists profiles_accent_id_len;

alter table public.profiles
  add constraint profiles_accent_id_len
  check (char_length(accent_id) between 1 and 24);
