-- Six tables evaluating two policies where one will do.
--
-- Permissive policies for the same role and command are OR'd, and Postgres
-- runs every one of them against every candidate row. Six tables had two
-- apiece on one command. The advisor reports this thirty times because it
-- counts once per role, which made it look five times larger than it is —
-- it is six duplications, not thirty.
--
-- Four are a plain OR-merge of two policies on the same command. Two are a
-- different shape: an `ALL` policy overlapping a `SELECT` policy, where the
-- fix is to narrow the `ALL` to the writes it is actually for.
--
-- ── How the equivalence was established ───────────────────────────────────
--
-- Not by sampling. Every (user, row) pair in all six tables — 18,101 of them
-- — was evaluated under the old pair of expressions and the new single one,
-- and compared. Zero differences.
--
-- One case the data could not prove, proved by reading instead: folding
-- `showcase items: owner writes` out of SELECT is only safe if an owner
-- always satisfies the board-visibility policy. That policy ends in
-- `can_see_profile(s.user_id)`, and can_see_profile's first clause is
-- `p_user = (select auth.uid())` — self is visible unconditionally, whatever
-- the privacy or suspension state. Every account in the database today is
-- public, so no amount of data would have shown this.
--
-- Nothing here changes who can see what. It changes how many times the
-- question is asked.

-- ── 1. reports: admin OR reporter ────────────────────────────────────────
drop policy if exists "reports: admin read" on public.reports;
drop policy if exists "reports: own read" on public.reports;
create policy "reports: admin or own read" on public.reports
  for select using (is_admin() or reporter_id = (select auth.uid()));

-- ── 2. message_reports: the same shape ───────────────────────────────────
drop policy if exists "message_reports: admin read" on public.message_reports;
drop policy if exists "message_reports: own read" on public.message_reports;
create policy "message_reports: admin or own read" on public.message_reports
  for select using (is_admin() or reporter_id = (select auth.uid()));

-- ── 3. note_hypes: the hyper and the note's owner ────────────────────────
drop policy if exists note_hypes_hyper_select on public.note_hypes;
drop policy if exists note_hypes_owner_select on public.note_hypes;
create policy note_hypes_select on public.note_hypes
  for select using (
    (select auth.uid()) = hyper_id or (select auth.uid()) = note_owner_id
  );

-- ── 4. notifications: recipient always, actor only for a follow ──────────
drop policy if exists "notifications: recipient delete" on public.notifications;
drop policy if exists "notifications: actor delete follow" on public.notifications;
create policy "notifications: recipient or follow actor delete" on public.notifications
  for delete using (
    (select auth.uid()) = user_id
    or ((select auth.uid()) = actor_id and type = 'follow')
  );

-- ── 5. note_reactions: an ALL policy that also covered SELECT ────────────
--
-- `note_reactions_reactor_all` is FOR ALL, so it was a second SELECT policy
-- as well as the write rule. Narrowed to the three writes it exists for,
-- and the two read rules become one.
drop policy if exists note_reactions_reactor_all on public.note_reactions;
drop policy if exists note_reactions_owner_select on public.note_reactions;

create policy note_reactions_select on public.note_reactions
  for select using (
    (select auth.uid()) = reactor_id or (select auth.uid()) = note_owner_id
  );
create policy note_reactions_reactor_insert on public.note_reactions
  for insert with check ((select auth.uid()) = reactor_id);
create policy note_reactions_reactor_update on public.note_reactions
  for update using ((select auth.uid()) = reactor_id)
  with check ((select auth.uid()) = reactor_id);
create policy note_reactions_reactor_delete on public.note_reactions
  for delete using ((select auth.uid()) = reactor_id);

-- ── 6. showcase_items: the same, and the reader rule already covers owners ─
--
-- "follow the board" already admits the owner — its first conjunct has an
-- explicit owner branch and its second is satisfied by can_see_profile(self).
-- So the ALL policy contributed nothing to SELECT, and keeping it meant
-- every read of a showcase item evaluated an extra EXISTS against showcases.
drop policy if exists "showcase items: owner writes" on public.showcase_items;

create policy "showcase items: owner insert" on public.showcase_items
  for insert with check (
    exists (select 1 from public.showcases s
             where s.id = showcase_id and s.user_id = (select auth.uid()))
  );
create policy "showcase items: owner update" on public.showcase_items
  for update using (
    exists (select 1 from public.showcases s
             where s.id = showcase_id and s.user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.showcases s
             where s.id = showcase_id and s.user_id = (select auth.uid()))
  );
create policy "showcase items: owner delete" on public.showcase_items
  for delete using (
    exists (select 1 from public.showcases s
             where s.id = showcase_id and s.user_id = (select auth.uid()))
  );
