-- A place typed on a Show's location sticker is looked up through
-- /api/places, which asks OpenStreetMap's Nominatim. Its usage policy is
-- at most one request a second from the whole app, so each person is
-- capped here as well as debounced in the client: 200 an hour is a lot of
-- typing, and nowhere near enough to be a scraper.
create or replace function public.api_rate_limit(p_action text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    when 'places'       then v_limit := 200; v_window := interval '1 hour';
    else raise exception 'Unknown rate-limit action: %', p_action;
  end case;
  perform public.rate_limit('api_' || p_action, v_limit, v_window);
end $function$;
