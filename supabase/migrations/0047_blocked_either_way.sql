-- Blocking was one-directional in the read path.
--
-- blocked_users has a single RLS policy — `blocker_id = auth.uid()` — so any
-- direct query can only return people YOU blocked. There is no way for a
-- client to learn who blocked THEM, which meant:
--
--   * someone who blocked you stayed fully visible in your feed, search and
--     discover, and you were one tap from their profile;
--   * your content stayed visible to them.
--
-- Neither party gets what they asked for. The reverse direction is unreadable
-- by design, so it needs SECURITY DEFINER.
--
-- Returns the OTHER party's id from rows in either direction, so the caller
-- gets one flat "do not show" set without learning which way round any
-- individual block runs. That distinction is not the feed's business, and
-- exposing it would leak "this person blocked you", which is precisely the
-- thing a block is not supposed to announce.
--
-- Deliberately uncapped. A truncated block list does not degrade gracefully —
-- it silently shows you someone you blocked. Where "too many rows" costs a
-- slow query and "too few" costs a safety incident, unbounded is the correct
-- direction to err in.

create or replace function public.blocked_either_way()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct
    case when b.blocker_id = (select auth.uid()) then b.blocked_id else b.blocker_id end
  from public.blocked_users b
  where b.blocker_id = (select auth.uid())
     or b.blocked_id = (select auth.uid());
$$;

revoke all on function public.blocked_either_way() from public, anon;
grant execute on function public.blocked_either_way() to authenticated;
