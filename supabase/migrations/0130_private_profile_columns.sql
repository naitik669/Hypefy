-- 0130_private_profile_columns.sql
--
-- The profiles table let anyone, signed in or not, read every column. That
-- included date of birth (of people as young as thirteen), who is an admin,
-- why an account was suspended and by whom, who referred whom, notification
-- preferences and the admin-only "do not target" flag.
--
-- The row rule stays as it is (profiles are public). What changes is which
-- columns the API roles may read: the table-wide grant goes, and every
-- column that is meant to be seen is granted by name. The owner reads their
-- own private fields through my_private_profile() (0129).
--
-- A COLUMN ADDED LATER IS NOT READABLE until it is granted here in the same
-- way. That is the point: private by default.

revoke select on public.profiles from anon, authenticated;

grant select (
  id, username, display_name, bio, avatar_url, avatar_hue, banner_id,
  banner_url, current_vibe, interests, profile_completed, created_at,
  updated_at, profile_tags, is_private, dm_privacy, last_seen_at,
  show_activity, is_verified, anthem, hide_read_receipts, card_layout,
  card_theme, accent_id, suspended_at, suspended_until, is_premium,
  badge_revoked, name_font, name_glow, avatar_decoration, bubble_style,
  nameplate, banner_color_1, banner_color_2, profile_colors, show_hypes
) on public.profiles to anon, authenticated;
