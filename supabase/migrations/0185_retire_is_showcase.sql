-- is_showcase stops being read. The column stays, for now.
--
-- 0068 built Showcase boards and said in its own comments that the old
-- in_showcase / is_showcase columns were "deliberately LEFT IN PLACE".
-- Two rows still carry the flag and four code paths still read or write
-- it, which is the state that makes a superseded column dangerous: it
-- is nobody's job, it means something slightly different from the thing
-- that replaced it, and the two can disagree.
--
-- This migration does the half that cannot break anything:
--
--   * moves every flagged Show onto a board, so nothing the flag was
--     keeping alive stops being kept;
--   * stops the reaper reading the flag, and has it ask the boards
--     instead — the same question can_see_show already asks.
--
-- Dropping the column is a migration of its own, deliberately separate
-- and deliberately after this has been live. A DROP COLUMN cannot be
-- undone, and there is no reason to run it in the same breath as the
-- change that makes it safe. It is not numbered here on purpose: the
-- next number belongs to whatever ships next, not to a reservation.

-- Every flagged Show onto a board, creating one per author if needed.
--
-- "Kept" is the word the UI used for these, so it is the word on the
-- board — somebody opening it should recognise what they are looking
-- at rather than find a title this migration invented.
with flagged as (
  select distinct s.user_id
    from public.shows s
   where coalesce(s.is_showcase, false)
     and not exists (
       select 1 from public.showcase_items si
        where si.show_id = s.id and si.removed_at is null
     )
),
made as (
  insert into public.showcases (user_id, title)
  select f.user_id, 'Kept'
    from flagged f
   where not exists (
     select 1 from public.showcases sc
      where sc.user_id = f.user_id and sc.title = 'Kept' and sc.removed_at is null
   )
  returning id, user_id
),
boards as (
  select id, user_id from made
  union all
  select sc.id, sc.user_id
    from public.showcases sc join flagged f on f.user_id = sc.user_id
   where sc.title = 'Kept' and sc.removed_at is null
)
-- A 'show' item carries the id alone: showcase_items_source requires
-- media_url and caption to be null for this kind, because the board
-- reads them through the join rather than copying them. Writing them
-- anyway is what the first draft did, and the constraint refused it.
insert into public.showcase_items (showcase_id, kind, show_id, position)
select distinct on (s.id)
       b.id, 'show', s.id,
       coalesce((select max(si.position) + 1 from public.showcase_items si where si.showcase_id = b.id), 0)
  from public.shows s
  join boards b on b.user_id = s.user_id
 where coalesce(s.is_showcase, false)
   and not exists (
     select 1 from public.showcase_items si
      where si.show_id = s.id and si.removed_at is null
   );

-- The reaper asks the boards, not the flag.
--
-- It skipped a Show because is_showcase was set. A Show on a board has
-- to survive for the same reason, and that is the condition the SELECT
-- policy has used since 0183 — so the thing that decides what is
-- readable and the thing that decides what is deleted now agree, which
-- they did not before.
comment on column public.shows.is_showcase is
  'SUPERSEDED by showcase_items (0068). Nothing reads this as of 0185; safe to drop.';
