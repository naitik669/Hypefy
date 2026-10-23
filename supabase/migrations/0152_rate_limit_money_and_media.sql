-- Caps for the remaining routes that cost something to call.
--
-- 0144 added `ice`. These are the rest of the list from the audit: the
-- billing routes, which talk to Razorpay and create orders; the one-shot
-- reader, which serves a view-once photo and then deletes it; and the
-- Spotify proxy, which spends a third-party quota.
--
-- Not every unguarded route is here, on purpose:
--
--   billing/webhook   Razorpay calls it, not a person. It is verified by
--                     signature, and a per-user cap would be meaningless
--                     and could drop real events.
--   push, oneshot/reap  pg_cron calls them behind a shared secret, now
--                     compared in constant time.
--   readiness         admin only, and cheap.
--   account/delete    destructive but self-only, and already behind a
--                     second factor.
--
-- The limits are held here rather than passed in, so a client cannot raise
-- its own cap — the reason api_rate_limit exists at all rather than the raw
-- rate_limit primitive.
--
-- 20 an hour for billing: ordering and subscribing are rare, deliberate
-- acts. 60 for the other two, which a normal session can plausibly reach.

create or replace function public.api_rate_limit(p_action text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_limit int; v_window interval;
begin
  case p_action
    when 'gifs'         then v_limit := 120; v_window := interval '1 hour';
    when 'music'        then v_limit := 120; v_window := interval '1 hour';
    when 'client_error' then v_limit := 20;  v_window := interval '1 hour';
    when 'ice'          then v_limit := 30;  v_window := interval '1 hour';
    when 'billing'      then v_limit := 20;  v_window := interval '1 hour';
    when 'oneshot'      then v_limit := 60;  v_window := interval '1 hour';
    when 'spotify'      then v_limit := 60;  v_window := interval '1 hour';
    else raise exception 'Unknown rate-limit action: %', p_action;
  end case;
  perform public.rate_limit('api_' || p_action, v_limit, v_window);
end $$;

revoke all on function public.api_rate_limit(text) from anon;
grant execute on function public.api_rate_limit(text) to authenticated;
