-- Creator mode: a switch that reveals the dashboard.
--
-- Opt-in rather than on for everybody, and it changes nothing anybody else
-- can see. Your profile looks identical whether this is on or off; there
-- is no badge, no category, no label. All it does is decide whether the
-- creator dashboard is reachable from settings.
--
-- That is the whole feature on purpose. A "creator account" that announces
-- itself is a different and much larger product decision — it changes how
-- people read your profile before they have read a word of it — and this
-- does not quietly make it on the way to shipping some charts.
--
-- Note the column-level grants. profiles does not grant at table level:
-- authenticated has INSERT and UPDATE on a named list of columns, so a new
-- column is unwritable until it is named here. The 0195 header says the
-- same thing about posts.media; it is the same arrangement and the same
-- trap.

alter table public.profiles
  add column if not exists creator_mode boolean not null default false;

-- No select grant. profiles revoked its table-wide select in 0130 and
-- grants per column, and its select policy is "viewable by everyone", so
-- granting select here would make "who has creator tools on" readable
-- about anybody. It did, briefly; 0208 revoked it and moved the read into
-- my_private_profile(). The line is gone from here too so that a rebuild
-- from migrations never has the leak in the first place.
--
-- Update stays: you have to be able to turn it on, and update is bounded
-- to your own row by the existing policy. Reading was the part that leaked.
grant insert (creator_mode), update (creator_mode) on public.profiles to authenticated;
