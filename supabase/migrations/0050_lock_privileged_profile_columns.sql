-- Any signed-in user could make themselves an admin.
--
-- The profiles UPDATE policy is `using (auth.uid() = id)` with no WITH CHECK,
-- and `authenticated` (and `anon`) held a TABLE-LEVEL update grant on profiles,
-- which covers every column. So a single PATCH of your own row with
-- {"is_admin": true} was enough to pass RLS — it is your row — and land you in
-- /admin/reports, reading every report ever filed and the identity of every
-- reporter. The same PATCH sets is_verified, which 0002 locked at the FUNCTION
-- level (set_verified) while leaving the column itself writable, so that
-- migration's whole intent was defeated by the direct path.
--
-- Column privileges are checked BEFORE row-level security, so grants are the
-- real gate here, not policies. Written as an allowlist on purpose: a column
-- added tomorrow is not writable until someone grants it explicitly, so the
-- failure mode of forgetting is a broken write, not a silent hole.
--
-- Mechanical trap worth recording: `revoke update (is_admin)` does NOT subtract
-- from a table-level grant — Postgres treats table-level and column-level
-- privileges as independent. The table grant has to go entirely and come back
-- column by column, which is what this does.

revoke update on public.profiles from anon, authenticated, public;

-- Everything the app actually writes, verified against every call site:
-- settings/profile/actions.ts, setup-profile/actions.ts, PrivacySettings.tsx,
-- ProfileCardEditor.tsx, BannerEditMenu.tsx, AnthemChip.tsx, InterestSheet.tsx,
-- and the notification preferences form.
grant update (
  username, display_name, bio, avatar_url, avatar_hue,
  banner_id, banner_url, current_vibe, interests, profile_tags,
  profile_completed, is_private, dm_privacy, notif_prefs,
  show_activity, two_step_enabled, anthem, hide_read_receipts,
  card_layout, card_theme, accent_id
) on public.profiles to authenticated;

-- anon gets nothing. It previously held UPDATE on all 28 columns.

-- Withheld, and why:
--   id           — the row identity
--   is_admin     — the escalation this migration exists for
--   is_verified  — self-awarded verification badge
--   referred_by  — fake referral credit, plus a notification to a stranger
--   last_seen_at — forged presence; written by touch_last_seen() instead
--   created_at   — defeats claim_referral()'s 7-day freshness window
--   updated_at   — trigger-managed

-- The policy had no WITH CHECK, so the new row was never checked at all. With
-- only USING, Postgres reuses it for the check on UPDATE, but stating it is
-- clearer than relying on that.
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Belt to the grants' braces. Grants are invisible in a migration diff, so the
-- day someone "fixes" a broken write with a blanket `grant update on profiles`,
-- this still holds.
--
-- last_seen_at is deliberately NOT preserved here: touch_last_seen() is a
-- definer function that legitimately writes it on every heartbeat, and the
-- grant above already blocks the direct client path.
create or replace function public.tg_profiles_preserve_privileged()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- SECURITY DEFINER functions (admin_set_admin, set_verified, claim_referral)
  -- run as the owner and are the trusted path; they are exempt.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  new.id          := old.id;
  new.is_admin    := old.is_admin;
  new.is_verified := old.is_verified;
  new.referred_by := old.referred_by;
  new.created_at  := old.created_at;
  return new;
end $$;

drop trigger if exists profiles_preserve_privileged on public.profiles;
create trigger profiles_preserve_privileged
  before update on public.profiles
  for each row execute function public.tg_profiles_preserve_privileged();

revoke execute on function public.tg_profiles_preserve_privileged() from public, anon, authenticated;
