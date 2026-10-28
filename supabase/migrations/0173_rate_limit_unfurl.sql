-- A cap for the link-preview reader.
--
-- /api/unfurl fetches a page on the user's behalf, which costs a function
-- invocation and an outbound request each time. It is reached by opening a
-- conversation that has links in it rather than by pressing anything, so
-- the cap has to clear a normal reading session: scrolling a chat full of
-- shared videos can ask for a few dozen in a minute, and the client caches
-- each answer for the session, so the same link is not asked for twice.
--
-- 200 an hour. High enough that reading does not hit it, low enough that
-- an account cannot use the server as a crawler. The hosts are allowlisted
-- in src/lib/link-preview.ts, so this is the volume limit, not the reach
-- limit.
--
-- Rewritten in full rather than patched, because the whole body is one
-- CASE and a replace is the only way to add an arm.

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
    when 'unfurl'       then v_limit := 200; v_window := interval '1 hour';
    else raise exception 'Unknown rate-limit action: %', p_action;
  end case;
  perform public.rate_limit('api_' || p_action, v_limit, v_window);
end $$;

revoke all on function public.api_rate_limit(text) from anon;
grant execute on function public.api_rate_limit(text) to authenticated;
