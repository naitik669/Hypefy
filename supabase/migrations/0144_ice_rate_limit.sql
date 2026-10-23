-- A cap on how often one account may ask for relay credentials.
--
-- /api/calls/ice mints a TURN login that is good for an hour and usable by
-- whoever holds it, from anywhere. A relay carries other people's traffic at
-- the owner's cost, which src/lib/ice.ts says in as many words — so an
-- endpoint that hands those out without a ceiling is a standing invitation
-- to collect them in a loop and spend someone else's bandwidth.
--
-- It costs nothing today because no relay is configured and the endpoint
-- answers with STUN. That is exactly why this goes in now: configuring the
-- relay is a launch task, and it is the act of doing that work that would
-- open the hole. The guard should already be there when it does.
--
-- 30 an hour. The browser keeps a config for 30 minutes (KEEP_MS in
-- call-setup.ts), so an ordinary caller asks about twice an hour per tab and
-- this is fifteen times more than anyone needs. A refusal is also safe:
-- getRtcConfig treats any non-ok answer as "no relay" and places the call
-- over STUN, so the cap degrades a call rather than preventing one.

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
    else raise exception 'Unknown rate-limit action: %', p_action;
  end case;
  perform public.rate_limit('api_' || p_action, v_limit, v_window);
end $$;

revoke all on function public.api_rate_limit(text) from anon;
grant execute on function public.api_rate_limit(text) to authenticated;
