-- 0137_profile_pronouns.sql
--
-- Pronouns on a profile. Shown beside the handle on the profile header, on
-- the card and on the Hypefy ID — the same in all three, because a field
-- someone sets and then cannot find is a field they assume did not save.
--
-- A fixed list rather than free text. Five entries cover nearly everyone,
-- they fit on a card without wrapping, and a public free-text field is a
-- moderation surface this app does not need another of. Adding a sixth is
-- one line here and one in PRONOUNS.
--
-- The check constraint is the boundary. The form validates too, but a form
-- is a convenience and the grant below means anyone with a session can
-- PATCH this column directly.

alter table public.profiles add column if not exists pronouns text;

alter table public.profiles drop constraint if exists profiles_pronouns_valid;
alter table public.profiles add constraint profiles_pronouns_valid
  check (pronouns is null or pronouns in ('he/him','she/her','they/them','he/they','she/they'));

-- Readable by anyone (0130 made columns private by default), writable by
-- its owner — unlike member_no, this is theirs to set (0050's allowlist).
grant select (pronouns) on public.profiles to anon, authenticated;
grant update (pronouns) on public.profiles to authenticated;

notify pgrst, 'reload schema';
