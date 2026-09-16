-- The mix-your-own profile background is gone: it never looked like Hypefy.
-- Banners come from your own gallery (Edit profile), and Premium's banner
-- perk is the animated GIF, which 0082 already covers.
--
-- Nobody had picked a pair of colours (0 of 18 profiles), so nothing is lost.
drop trigger if exists profiles_gradient_premium on public.profiles;
drop function if exists public.tg_profiles_gradient_premium();

alter table public.profiles drop constraint if exists profiles_profile_colors_check;
alter table public.profiles drop column if exists profile_colors;
