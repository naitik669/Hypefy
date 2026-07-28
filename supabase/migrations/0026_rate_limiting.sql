-- Anti-abuse baseline. There was no server-side rate limiting anywhere — reports,
-- comments, and follows were all trivially spammable. Add a small sliding-window
-- limiter and enforce it via BEFORE INSERT triggers on the spammable tables.
-- Limits are generous enough that a normal user never hits them.

create table if not exists public.rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_events_lookup_idx on public.rate_events(user_id, action, created_at);
alter table public.rate_events enable row level security;
-- No policies: only the SECURITY DEFINER limiter touches this table.

create or replace function public.rate_limit(p_action text, p_limit int, p_window interval)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid()); v_count int;
begin
  if v_uid is null then return; end if; -- auth is enforced by the caller/RLS
  select count(*) into v_count from public.rate_events
    where user_id = v_uid and action = p_action and created_at > now() - p_window;
  if v_count >= p_limit then
    raise exception 'Rate limit exceeded for %, please slow down.', p_action
      using errcode = 'check_violation';
  end if;
  insert into public.rate_events (user_id, action) values (v_uid, p_action);
end $$;

revoke all on function public.rate_limit(text, int, interval) from anon, authenticated;

-- reports: 10 / hour
create or replace function public.tg_rate_limit_reports() returns trigger
 language plpgsql security definer set search_path = public as $$
begin
  perform public.rate_limit('report', 10, interval '1 hour');
  return new;
end $$;
drop trigger if exists rate_limit_reports on public.reports;
create trigger rate_limit_reports before insert on public.reports
  for each row execute function public.tg_rate_limit_reports();

-- comments (incl. replies): 40 / 5 minutes
create or replace function public.tg_rate_limit_comments() returns trigger
 language plpgsql security definer set search_path = public as $$
begin
  perform public.rate_limit('comment', 40, interval '5 minutes');
  return new;
end $$;
drop trigger if exists rate_limit_comments on public.comments;
create trigger rate_limit_comments before insert on public.comments
  for each row execute function public.tg_rate_limit_comments();

-- follows: 100 / hour, but only self-initiated follows (skip request approvals,
-- where the inserted follower_id is the requester, not the approver).
create or replace function public.tg_rate_limit_follows() returns trigger
 language plpgsql security definer set search_path = public as $$
begin
  if new.follower_id = (select auth.uid()) then
    perform public.rate_limit('follow', 100, interval '1 hour');
  end if;
  return new;
end $$;
drop trigger if exists rate_limit_follows on public.follows;
create trigger rate_limit_follows before insert on public.follows
  for each row execute function public.tg_rate_limit_follows();
