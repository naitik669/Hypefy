-- Two of 0157's functions were reachable through the REST API for no reason.
--
-- Found by re-reading the Supabase advisors after the day's migrations rather
-- than by assuming they were clean:
--
--   is_media_blocked(bit)       granted to authenticated in 0157. Nothing
--                               calls it from the client — check_media(text)
--                               is the entry point, and 0158 established that
--                               a bit parameter cannot cross PostgREST at
--                               all. check_media is SECURITY DEFINER, so it
--                               runs this as the owner either way.
--
--   tg_harvest_removed_media()  a trigger function, exposed by the default
--                               grant. A trigger does not need EXECUTE to
--                               fire; only a direct RPC call would, and that
--                               would be someone trying to drive the harvest
--                               by hand.
--
-- Verified before applying: check_media still answers for a signed-in user,
-- and a takedown still harvests.

revoke all on function public.is_media_blocked(bit) from public, anon, authenticated;
revoke all on function public.tg_harvest_removed_media() from public, anon, authenticated;
