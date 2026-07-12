-- Admin reports queue: profiles.is_admin gates the owner-only /admin/reports
-- page, and admins can read + resolve reports under RLS.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Reusable check (used by policies below and any future admin surface).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select is_admin from public.profiles where id = (select auth.uid())), false);
$$;

drop policy if exists "reports: admin read" on public.reports;
create policy "reports: admin read" on public.reports
  for select using (public.is_admin());

drop policy if exists "reports: admin update" on public.reports;
create policy "reports: admin update" on public.reports
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "message_reports: admin read" on public.message_reports;
create policy "message_reports: admin read" on public.message_reports
  for select using (public.is_admin());

drop policy if exists "message_reports: admin update" on public.message_reports;
create policy "message_reports: admin update" on public.message_reports
  for update using (public.is_admin()) with check (public.is_admin());
