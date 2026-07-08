-- The chat UI reports groups with target_type 'conversation', but the
-- reports check constraint didn't allow it — those inserts failed
-- silently. Align the constraint with every surface that can report.
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post','comment','message','profile','shot','conversation'));
