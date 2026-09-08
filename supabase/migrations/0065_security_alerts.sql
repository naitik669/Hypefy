-- ─────────────────────────────────────────────────────────────────────
-- One way for the app to tell you something happened to your account.
--
-- The obvious implementation — insert a notification from the client — is
-- impossible here, and quietly so: the "notifications: no client insert"
-- policy has `with check (false)`, so a browser insert does not error in a
-- way anyone notices, it simply never appears. Wrapping it in a try/catch
-- (which is what I first wrote) produces a feature that looks finished and
-- has never once worked.
--
-- So: a definer RPC, restricted to alerts about YOUR OWN account, which is
-- the only kind there is.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.log_security_alert(p_body text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- Only ever addressed to the caller, so this cannot be used to push text
  -- into someone else's notification list.
  --
  -- Rate-limited because the body is caller-supplied: without it, a
  -- compromised session could bury the genuine "two-factor was turned off"
  -- alert under a hundred lookalikes.
  perform public.rate_limit('security_alert', 20, interval '1 hour');

  insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
  values (v_uid, null, 'security_alert', null, null, left(btrim(coalesce(p_body, '')), 140));
end $$;

revoke all on function public.log_security_alert(text) from public, anon;
grant execute on function public.log_security_alert(text) to authenticated;
