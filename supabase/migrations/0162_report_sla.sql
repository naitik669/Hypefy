-- Being able to prove the commitment on /grievance.
--
-- That page publishes the timeframes the IT Rules 2021 set: acknowledge a
-- complaint within 24 hours, dispose of it within fifteen days. The queue
-- could not measure either. `reports` had `status` and `created_at` and
-- nothing else, so "were we inside fifteen days" was unanswerable, and a
-- published commitment nobody can evidence is worse than no commitment —
-- it is the one a regulator asks about first.
--
-- Four columns and a summary. The point is not the columns; it is that the
-- numbers are now in front of the person who has to meet them, at the top of
-- the queue they already work.
--
-- ── What this measures, and what it does not ───────────────────────────────
--
-- This is the IN-APP report queue: the ··· menu on a post, Shot, comment,
-- message or profile. Disposal is exact — created_at to resolved_at.
--
-- It does NOT measure grievances emailed to grievance@hypefy.chat. Those live
-- in a mailbox, and nothing here can see them. The 24-hour acknowledgement in
-- the Rules is, strictly, about replying to a complainant, which an in-app
-- report has no channel for; `acknowledged_at` here means "a human has this
-- in hand", which is the honest in-app analogue and is deliberately not
-- called acknowledgement-to-the-complainant. Measuring the mailbox is a
-- separate problem and probably not a code one.
--
-- No backfill. Every report is open and nothing has ever been resolved, so
-- there is no history to recover — and inventing a resolved_at for a row that
-- predates the column would be fabricating the very evidence this exists to
-- provide.

alter table public.reports
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references public.profiles(id) on delete set null,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null;

alter table public.message_reports
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references public.profiles(id) on delete set null,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null;

-- The SLA query only ever looks at what is still open, and that stays small
-- while the resolved pile grows.
create index if not exists reports_open_created_idx
  on public.reports (created_at) where status = 'open';
create index if not exists message_reports_open_created_idx
  on public.message_reports (created_at) where status = 'open';

/**
 * Mark a report as in hand.
 *
 * Idempotent: the first admin to pick it up owns it, and a second click does
 * not reset the clock. That matters — an acknowledgement time that moves is
 * not a measurement.
 */
create or replace function public.admin_acknowledge_report(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := (select auth.uid());
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if p_table not in ('reports', 'message_reports') then
    raise exception 'Unknown report table %', p_table;
  end if;

  execute format(
    'update public.%I set acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = $1
      where id = $2 and acknowledged_at is null', p_table
  ) using v_me, p_id;
end;
$function$;

revoke all on function public.admin_acknowledge_report(text, uuid) from public, anon;
grant execute on function public.admin_acknowledge_report(text, uuid) to authenticated;

/**
 * Resolving now stamps when, and by whom.
 *
 * Resolving also acknowledges, if nobody had: you cannot dispose of something
 * without having had it in hand, and leaving the column null would overstate
 * the breach count.
 *
 * Reopening clears both. A report put back to open is not resolved, and a
 * stale resolved_at would quietly make the numbers say the opposite of the
 * truth — which is the one failure mode this whole migration exists to stop.
 */
create or replace function public.admin_resolve_report(p_table text, p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := (select auth.uid());
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if p_table not in ('reports', 'message_reports') then
    raise exception 'Unknown report table %', p_table;
  end if;
  if p_status not in ('open', 'resolved', 'dismissed') then
    raise exception 'Unknown status %', p_status;
  end if;

  if p_status = 'open' then
    execute format(
      'update public.%I set status = $1, resolved_at = null, resolved_by = null
        where id = $2', p_table
    ) using p_status, p_id;
  else
    execute format(
      'update public.%I
          set status = $1,
              resolved_at = now(),
              resolved_by = $2,
              acknowledged_at = now(),
              acknowledged_by = coalesce(acknowledged_by, $2)
        where id = $3', p_table
    ) using p_status, v_me, p_id;
  end if;

  insert into public.moderation_actions (actor_id, action, target_type, target_id, report_id)
  values (v_me, case when p_status = 'dismissed' then 'dismiss' else 'resolve' end,
          p_table, p_id, p_id);
end;
$function$;

/**
 * Where the queue stands against the published timeframes.
 *
 * One row, read at the top of the admin queue. Counts both tables together,
 * because a person waiting does not care which one their report landed in.
 */
create or replace function public.report_sla()
returns table (
  open_total integer,
  unacknowledged_over_24h integer,
  open_over_15_days integer,
  oldest_open_hours integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with all_open as (
    select created_at, acknowledged_at from public.reports where status = 'open'
    union all
    select created_at, acknowledged_at from public.message_reports where status = 'open'
  )
  select
    count(*)::int,
    count(*) filter (
      where acknowledged_at is null and created_at < now() - interval '24 hours'
    )::int,
    count(*) filter (where created_at < now() - interval '15 days')::int,
    coalesce(max(extract(epoch from (now() - created_at)) / 3600), 0)::int
  from all_open;
$function$;

revoke all on function public.report_sla() from public, anon;
grant execute on function public.report_sla() to authenticated;
