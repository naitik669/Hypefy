-- Diary archive: your past Diaries, kept for you alone.
--
-- A Diary is one row in `notes`, replaced in place by set_note and removed by
-- clear_note — so until now, writing a new one destroyed the old one, and an
-- expired one sat invisible until the next overwrote it. This keeps every
-- Diary once it stops being current, for its author only.
--
-- Captured by a trigger on `notes`, not by the RPCs, so nothing that writes a
-- Diary can forget to archive it: a replacement, a take-down, and an account
-- that simply lets it expire all end up here the same way.
--
-- Private by construction: the only policies are the author selecting and
-- deleting their own rows. There is no insert or update policy at all, and
-- the table grants none — the trigger function writes as its owner.

create table if not exists public.diary_archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  audience text not null check (audience in ('mutual', 'close')),
  track jsonb,
  -- When the Diary was written (the note's created_at).
  written_at timestamptz not null,
  -- When it stopped being your current Diary, and why.
  ended_at timestamptz not null default now(),
  ended_how text not null check (ended_how in ('replaced', 'taken_down', 'expired')),
  -- One archive row per Diary, however many times a trigger sees it.
  unique (user_id, written_at)
);

create index if not exists diary_archive_user_written_idx
  on public.diary_archive (user_id, written_at desc);

alter table public.diary_archive enable row level security;

drop policy if exists diary_archive_owner_select on public.diary_archive;
create policy diary_archive_owner_select on public.diary_archive
  for select using ((select auth.uid()) = user_id);

drop policy if exists diary_archive_owner_delete on public.diary_archive;
create policy diary_archive_owner_delete on public.diary_archive
  for delete using ((select auth.uid()) = user_id);

revoke all on table public.diary_archive from anon;
revoke insert, update on table public.diary_archive from authenticated;
grant select, delete on table public.diary_archive to authenticated;

-- ── Capture ────────────────────────────────────────────────────────────────

create or replace function public.archive_diary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_how text;
begin
  if tg_op = 'UPDATE' then
    -- set_note refreshes created_at on every write. An update that keeps it
    -- is not a new Diary (nothing does that today, but it must not archive a
    -- page that is still current).
    if new.created_at = old.created_at then
      return new;
    end if;
    v_how := case when old.expires_at <= now() then 'expired' else 'replaced' end;
  else
    v_how := case when old.expires_at <= now() then 'expired' else 'taken_down' end;
  end if;

  insert into public.diary_archive (user_id, text, audience, track, written_at, ended_how)
  values (old.user_id, old.text, old.audience, old.track, old.created_at, v_how)
  on conflict (user_id, written_at) do nothing;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.archive_diary() from public, anon, authenticated;

drop trigger if exists archive_diary on public.notes;
create trigger archive_diary
  before update or delete on public.notes
  for each row execute function public.archive_diary();

-- ── Reading it ─────────────────────────────────────────────────────────────

-- Your archive, newest first — plus your current Diary if it has already
-- expired but not yet been replaced, which the trigger has had no reason to
-- see. Without that, a Diary you let run out would be missing from the
-- archive until the day you wrote the next one.
create or replace function public.get_diary_archive(p_limit int default 100)
returns table (
  id uuid,
  text text,
  audience text,
  track jsonb,
  written_at timestamptz,
  ended_how text
)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id, a.text, a.audience, a.track, a.written_at, a.ended_how
  from public.diary_archive a
  where a.user_id = (select auth.uid())
  union all
  select null::uuid, n.text, n.audience, n.track, n.created_at, 'expired'
  from public.notes n
  where n.user_id = (select auth.uid())
    and n.expires_at <= now()
    and not exists (
      select 1 from public.diary_archive a2
      where a2.user_id = n.user_id and a2.written_at = n.created_at
    )
  order by written_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.get_diary_archive(int) from public, anon;
grant execute on function public.get_diary_archive(int) to authenticated;

-- ── Forgetting one ─────────────────────────────────────────────────────────

-- Delete a past Diary for good, by when it was written. Covers both places a
-- past Diary can be: the archive, and — for one that expired and has not been
-- replaced — the notes table itself. Only an expired note is touched there:
-- taking down your CURRENT Diary is clear_note's job, not this one's.
create or replace function public.forget_diary(p_written_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  -- The note first: the trigger files it into the archive on the way out,
  -- and the next line then removes that row along with any existing one.
  delete from public.notes
   where user_id = v_uid and created_at = p_written_at and expires_at <= now();
  delete from public.diary_archive
   where user_id = v_uid and written_at = p_written_at;
end;
$$;

revoke all on function public.forget_diary(timestamptz) from public, anon;
grant execute on function public.forget_diary(timestamptz) to authenticated;
