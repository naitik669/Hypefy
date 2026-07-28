-- Moderation queue fix: ReportSheet historically inserted status='pending', but
-- the admin queue (ReportsQueue) only treats 'open' as actionable, so content
-- reports silently landed in "Handled" and no moderator saw them. Normalize any
-- existing 'pending' rows to 'open' and constrain status to the three real
-- states so this can't drift again. message_reports already uses 'open'.

update public.reports set status = 'open' where status = 'pending';

alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports
  add constraint reports_status_check check (status in ('open', 'resolved', 'dismissed'));
