-- A Shot can go to your Hypers rather than to everybody.
--
-- Shows have had this since they existed and Shots never did: every Shot
-- was public to whoever could already see you, and the composer offered
-- no say in it. Same two values Shows and notes use — everybody who could
-- already see you, or your Hypers, which is close_friends since
-- Favourites was folded into it in 0111.
--
-- ── enforced in the policy, not in the query ────────────────────────────
--
-- The feed reads shots with a plain select under RLS, so an audience
-- applied by adding a WHERE to the three places that read them would be
-- an audience that holds until somebody writes a fourth. The policy is
-- the only place it cannot be forgotten.
--
-- ── and why the check has to be a definer function ──────────────────────
--
-- close_friends has one policy: you may read rows where user_id is you.
-- Your own list, in other words — nobody can see the lists they are ON.
--
-- So an EXISTS over close_friends written inline in this policy is
-- evaluated as the VIEWER, finds nothing, and returns false for exactly
-- the people the Shot is for. The first draft of this migration did that,
-- and a dry run showed a hypers-only Shot visible to its author and to
-- nobody else at all — including the Hyper it was posted for. It looked
-- like a working privacy feature and was a broken one.
--
-- is_hyper_of runs as the definer and answers the one question the policy
-- needs, which is the same reason can_see_show is a definer and does the
-- same lookup inline.

create or replace function public.is_hyper_of(p_author uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.close_friends c
     where c.user_id = p_author
       and c.friend_id = (select auth.uid())
  );
$$;

revoke all on function public.is_hyper_of(uuid) from public, anon;
grant execute on function public.is_hyper_of(uuid) to authenticated;

alter table public.shots
  add column if not exists audience text not null default 'everyone';

alter table public.shots
  drop constraint if exists shots_audience_known;
alter table public.shots
  add constraint shots_audience_known check (audience in ('everyone', 'hypers'));

-- shots grants at table level, so there is no column grant to add — unlike
-- profiles and posts, where a new column is invisible until it is named.

-- The existing clauses are preserved exactly: archived, removed, and the
-- private-account check that already decides who may see a Shot at all.
-- This adds one more AND beside them rather than rewriting the rule, so a
-- Shot still has to pass everything it passed before AND the new test.
--
-- Note what the new clause does NOT say: it has no bearing on whether you
-- follow the author. Narrowing to Hypers narrows; it never widens. A Hyper
-- who cannot see a private account they do not follow still cannot see
-- this, because the clause above it already said so.
drop policy if exists "shots: anyone can read" on public.shots;
create policy "shots: anyone can read"
  on public.shots for select
  using (
    archived_at is null
    and (removed_at is null or user_id = (select auth.uid()) or is_admin())
    and (
      user_id = (select auth.uid())
      or not exists (
        select 1 from public.profiles p
         where p.id = shots.user_id and coalesce(p.is_private, false)
      )
      or exists (
        select 1 from public.follows f
         where f.following_id = shots.user_id and f.follower_id = (select auth.uid())
      )
    )
    and (
      user_id = (select auth.uid())
      or is_admin()
      or audience = 'everyone'
      or public.is_hyper_of(shots.user_id)
    )
  );
