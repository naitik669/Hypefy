-- 0219: two read policies that refused every query that touched them.
--
-- ── 1. The Shows ring has been empty since 0186 ──────────────────────
--
-- "collabs: the ones you are in" (show_collabs) reads show_collab_members,
-- and "collab members: visible inside the collab" (show_collab_members)
-- read show_collabs back to find the owner. Postgres expands each policy
-- inside the other and gives up: "infinite recursion detected in policy".
-- Every Shows query that embeds collab:show_collabs(...) failed with a 500,
-- which is both of the queries that fill the ring on Home, and the
-- joined-collab lookup failed the same way. Home tolerates those (a plainer
-- feed beats no feed), so the ring showed only your own bubble and looked
-- like nobody you follow had posted a Show. Measured on 26 Nov: 39 refusals
-- in 24 hours, the same every day back to 22 Nov, reproduced as a signed-in
-- user with set role.
--
-- The owner lookup moves into a SECURITY DEFINER helper, the same way
-- in_show_collab already answers the membership half: the definer reads
-- show_collabs without its policy, so there is no cycle left to expand.
-- What each clause allows is unchanged.

create or replace function public.owns_show_collab(p_collab uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.show_collabs c
     where c.id = p_collab and c.owner_id = p_user
  );
$$;

revoke all on function public.owns_show_collab(uuid, uuid) from public, anon;
grant execute on function public.owns_show_collab(uuid, uuid) to authenticated;

drop policy if exists "collab members: visible inside the collab" on public.show_collab_members;
create policy "collab members: visible inside the collab" on public.show_collab_members
  for select using (
    user_id = (select auth.uid())
    or public.in_show_collab(collab_id, (select auth.uid()))
    or public.owns_show_collab(collab_id, (select auth.uid()))
  );

-- ── 2. Signed-out visitors could not read any Shot ───────────────────
--
-- 0210 added public.is_hyper_of to the Shots read policy and revoked it
-- from anon. Postgres checks EXECUTE on every function in a policy before
-- it evaluates any of it, so the `audience = 'everyone'` beside it never
-- got the chance to short-circuit: every anon read of shots failed with
-- "permission denied for function is_hyper_of". That is the Shots tab and
-- the post count on a public profile, a Shot's link preview, and the
-- sitemap's Shots. 20 to 60 refusals a day since 15 Nov.
--
-- Granting it to anon leaks nothing: with no signed-in viewer auth.uid()
-- is null, the lookup matches no row, and the answer is always false, so a
-- signed-out visitor sees exactly the 'everyone' Shots and no Hypers-only
-- one.

grant execute on function public.is_hyper_of(uuid) to anon;
