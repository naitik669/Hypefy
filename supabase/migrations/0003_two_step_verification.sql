-- Opt-in 2-step verification (email one-time code at login). Off by default,
-- so signup/login stays "normal" unless the user turns this on in Settings.
alter table public.profiles add column if not exists two_step_enabled boolean not null default false;
