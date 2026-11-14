-- creator_mode should not have been readable by everybody.
--
-- 0207 granted select on it to anon and authenticated, which on this table
-- means every row: profiles revoked its table-wide select in 0130 and
-- grants per column instead, and the select policy is "viewable by
-- everyone". So a granted column is a column anybody can read about
-- anybody, and "who has creator tools on" became a public list.
--
-- That contradicts the thing the switch itself promises — nothing changes
-- on your profile and nobody is told — so it is a privacy leak and a
-- broken promise rather than merely untidy. The launch-hardening test
-- caught it the moment it ran: it pins the granted columns against the
-- list the app reads, both ways round, and a column granted and not
-- listed failed it.
--
-- The fix is the path that already exists for exactly this. Private
-- fields are not granted at all and come back through
-- my_private_profile(), a security definer that reads one row — your own.
-- date_of_birth, is_admin and notif_prefs all live there. This joins them.
--
-- The update grant stays: you have to be able to turn it on, and update is
-- bounded by the "update own profile" policy to your own row. Reading is
-- the part that leaked, not writing.

revoke select (creator_mode) on public.profiles from anon, authenticated;

create or replace function public.my_private_profile()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'date_of_birth', p.date_of_birth,
    'is_admin', p.is_admin,
    'suspension_reason', p.suspension_reason,
    'notif_prefs', p.notif_prefs,
    'mention_privacy', p.mention_privacy,
    'creator_mode', p.creator_mode,
    'referral_count', (select count(*) from public.profiles r where r.referred_by = p.id)
  )
  from public.profiles p
  where p.id = (select auth.uid());
$function$;
