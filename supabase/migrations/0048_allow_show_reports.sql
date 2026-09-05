-- Shows could not be reported, because 'show' was never an allowed target.
--
-- The viewer-facing half of this was worse: both the Shots rail and the Show
-- header gated their overflow menu behind `{isOwner && …}`, so someone
-- watching a stranger's content had no menu at all — no report, no block, no
-- way to raise a hand. Those are the two most viral surfaces in the app and
-- were the only two with no safety valve.
--
-- 'shot' was already permitted by 0010 and simply never passed by any UI.
-- 'show' was not permitted at all, so a Show report would have failed the
-- CHECK even once the button existed.
--
-- A Show expires in 24 hours, which makes it the easiest thing here to misuse
-- and the hardest to review after the fact. If anything it needed the report
-- path more than the permanent surfaces did.

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post','comment','message','profile','shot','show','conversation'));
