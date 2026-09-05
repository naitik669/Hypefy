-- Twelve trigger functions were callable over HTTP as /rest/v1/rpc/<name>.
--
-- PostgREST exposes every function in the `public` schema that the caller can
-- EXECUTE, and Postgres grants EXECUTE to PUBLIC by default — so each of these
-- got an endpoint simply by existing. 0027_lock_down_anon_rpcs.sql was a
-- one-time sweep over what existed then; nothing closes the door on new ones,
-- and these were added afterwards or missed.
--
-- Calling a trigger function directly usually errors for want of trigger
-- context, but "usually errors" is not a security boundary, and
-- enforce_profile_link_limit was reachable by `anon` — an unauthenticated
-- endpoint into a SECURITY DEFINER function.
--
-- Revoking EXECUTE does NOT stop the triggers. A trigger runs as the table
-- owner and never consults the caller's EXECUTE privilege, so every one of
-- these keeps firing exactly as before; only the HTTP surface goes away.

revoke execute on function public.bump_post_save_count()       from public, anon, authenticated;
revoke execute on function public.bump_share_count()           from public, anon, authenticated;
revoke execute on function public.bump_shot_save_count()       from public, anon, authenticated;
revoke execute on function public.enforce_profile_link_limit() from public, anon, authenticated;
revoke execute on function public.filter_notification_prefs()  from public, anon, authenticated;
revoke execute on function public.handle_new_user()            from public, anon, authenticated;
revoke execute on function public.handle_post_mentions()       from public, anon, authenticated;
revoke execute on function public.handle_repost_delete()       from public, anon, authenticated;
revoke execute on function public.handle_repost_insert()       from public, anon, authenticated;
revoke execute on function public.notify_push_webhook()        from public, anon, authenticated;
revoke execute on function public.set_updated_at()             from public, anon, authenticated;
revoke execute on function public.touch_conversation()         from public, anon, authenticated;
