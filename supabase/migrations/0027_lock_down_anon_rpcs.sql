-- Security: stop `anon` executing SECURITY DEFINER RPCs.
--
-- The baseline granted EXECUTE on every public function broadly, which left 31
-- SECURITY DEFINER functions callable by unauthenticated clients. Most no-op for
-- anon because they filter on auth.uid(), but `get_notes_for` did not: with a
-- NULL uid the "not blocked" and "not private" checks both pass, so anonymous
-- visitors to /u/[username] could read notes intended for a mutual-follow
-- circle. Revoke anon across the board and harden that function directly.
--
-- Nothing in the app needs anon RPC access: the only RPC reachable from a
-- public route is get_notes_for (which must not serve anon) and get_affinity
-- (already guarded by a signed-in check at src/app/(app)/shots/page.tsx:32).

-- 1. Revoke EXECUTE from PUBLIC on every SECURITY DEFINER function, then grant
--    it back to `authenticated` for the client-callable ones.
--
--    Revoking from `anon` alone does nothing: Postgres grants EXECUTE to PUBLIC
--    by default and anon inherits that, so the role-specific revoke is a no-op.
--    PUBLIC has to go first.
--
--    Trigger functions (returns trigger) are never granted — they run as the
--    table owner when the trigger fires. rate_limit is an internal primitive
--    that takes its own cap as an argument, so exposing it would let a caller
--    pass p_limit => 999999; set_verified and publish_due_scheduled_posts stay
--    service-role/cron only.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig,
           pg_get_function_result(p.oid) = 'trigger' as is_trigger,
           p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon', f.sig);

    if not f.is_trigger
       and f.proname not in ('rate_limit', 'set_verified', 'publish_due_scheduled_posts')
    then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- 2b. Rate limiting for the API proxy routes (/api/gifs, /api/music,
--     /api/client-error). The raw rate_limit() primitive stays revoked: it takes
--     the limit as an argument, so exposing it would let a client pass
--     p_limit => 999999 and bypass its own cap. This wrapper hardcodes the
--     limits server-side and is the only rate-limit entry point clients get.
create or replace function public.api_rate_limit(p_action text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_limit int; v_window interval;
begin
  case p_action
    when 'gifs'         then v_limit := 120; v_window := interval '1 hour';
    when 'music'        then v_limit := 120; v_window := interval '1 hour';
    when 'client_error' then v_limit := 20;  v_window := interval '1 hour';
    else raise exception 'Unknown rate-limit action: %', p_action;
  end case;
  perform public.rate_limit('api_' || p_action, v_limit, v_window);
end $$;

revoke all on function public.api_rate_limit(text) from anon;
grant execute on function public.api_rate_limit(text) to authenticated;

-- 3. Defence in depth: get_notes_for returns nothing when unauthenticated,
--    independent of who holds EXECUTE. Body is otherwise unchanged.
create or replace function public.get_notes_for(p_user_ids uuid[])
returns table (
  user_id uuid, text text, audience text, created_at timestamptz,
  display_name text, username text, avatar_hue int, avatar_url text, track jsonb
)
language sql stable security definer set search_path = public as $$
  select n.user_id, n.text, n.audience, n.created_at,
         p.display_name, p.username, p.avatar_hue, p.avatar_url, n.track
  from public.notes n
  join public.profiles p on p.id = n.user_id
  where (select auth.uid()) is not null      -- anonymous callers get nothing
    and n.user_id = any(p_user_ids)
    and n.expires_at > now()
    and (
      n.user_id = (select auth.uid())
      or (
        not exists (
          select 1 from public.blocked_users b
          where (b.blocker_id = (select auth.uid()) and b.blocked_id = n.user_id)
             or (b.blocker_id = n.user_id and b.blocked_id = (select auth.uid()))
        )
        and (
          not p.is_private
          or exists (select 1 from public.follows f
                     where f.follower_id = (select auth.uid()) and f.following_id = n.user_id)
        )
        and (
          n.audience = 'mutual'
          or exists (select 1 from public.close_friends cf
                     where cf.user_id = n.user_id and cf.friend_id = (select auth.uid()))
        )
      )
    );
$$;

revoke all on function public.get_notes_for(uuid[]) from anon;
grant execute on function public.get_notes_for(uuid[]) to authenticated;

-- 4. poll_votes: the read policy was `using (true)`, exposing every individual
--    ballot. Voters see their own row; aggregate tallies come from a counts RPC
--    so the UI keeps working without leaking who voted for what.
drop policy if exists "poll_votes: read" on public.poll_votes;
create policy "poll_votes: read own" on public.poll_votes
  for select using ((select auth.uid()) = voter_id);

create or replace function public.get_poll_counts(p_post_id uuid)
returns table (option_idx int, votes bigint)
language sql stable security definer set search_path = public as $$
  select v.option_idx, count(*)::bigint
  from public.poll_votes v
  where v.post_id = p_post_id
  group by v.option_idx
  order by v.option_idx;
$$;

revoke all on function public.get_poll_counts(uuid) from anon;
grant execute on function public.get_poll_counts(uuid) to authenticated;
