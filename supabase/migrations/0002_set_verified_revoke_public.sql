-- Security fix (found in two-account QA): set_verified must be service-role
-- only. Postgres grants EXECUTE to PUBLIC by default, so revoking from
-- anon/authenticated alone left a privilege-escalation hole — any logged-in
-- user could verify (or un-verify) anyone. Revoke from PUBLIC and grant
-- explicitly to service_role.
revoke execute on function public.set_verified(uuid, boolean) from public;
revoke execute on function public.set_verified(uuid, boolean) from anon;
revoke execute on function public.set_verified(uuid, boolean) from authenticated;
grant execute on function public.set_verified(uuid, boolean) to service_role;
