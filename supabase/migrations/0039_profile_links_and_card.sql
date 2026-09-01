-- ───────────────────────────────────────────────────────────────────
-- 0039: profile cards — custom link buttons, and the card's chosen look.
--
-- Applied to fyaioseridqabockidyp on 2 Sep 2026, recorded in Supabase as
-- `profile_links_and_card_template`.
--
-- The card is what people screenshot and what the profile QR resolves to,
-- so its links are readable by anyone: profiles are already publicly
-- readable, and a card behind auth would defeat the QR. Writes stay with
-- the owner via RLS.
--
-- No SECURITY DEFINER function reachable by anon and no new anon EXECUTE
-- grant, so 0027_lock_down_anon_rpcs is left intact.
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.profile_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  url text not null,
  position int not null default 0,
  created_at timestamptz not null default now(),

  -- Shape is enforced here as well as in the UI. RLS lets the owner write
  -- directly with the anon key, so the database is the real boundary.
  constraint profile_links_label_len check (char_length(btrim(label)) between 1 and 40),
  constraint profile_links_url_len check (char_length(url) between 4 and 500),
  -- http/https only. A javascript: or data: URL stored here would be
  -- stored XSS the moment the card renders it as an anchor href.
  constraint profile_links_url_scheme check (url ~* '^https?://[^\s]+$'),
  constraint profile_links_position check (position between 0 and 99)
);

create index if not exists profile_links_user_idx
  on public.profile_links (user_id, position);

alter table public.profile_links enable row level security;

drop policy if exists "profile_links: public read" on public.profile_links;
create policy "profile_links: public read" on public.profile_links
  for select using (true);

drop policy if exists "profile_links: owner insert" on public.profile_links;
create policy "profile_links: owner insert" on public.profile_links
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "profile_links: owner update" on public.profile_links;
create policy "profile_links: owner update" on public.profile_links
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "profile_links: owner delete" on public.profile_links;
create policy "profile_links: owner delete" on public.profile_links
  for delete to authenticated using (auth.uid() = user_id);

-- Cap the list so a card stays readable and cannot become a spam
-- billboard. A trigger rather than a check constraint, because it counts
-- sibling rows.
create or replace function public.enforce_profile_link_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.profile_links where user_id = new.user_id) >= 8 then
    raise exception 'A profile card can hold at most 8 links.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists profile_links_limit on public.profile_links;
create trigger profile_links_limit
  before insert on public.profile_links
  for each row execute function public.enforce_profile_link_limit();

-- Which card layout and colour the owner picked. Text rather than an enum
-- so adding a template later is a deploy, not a migration.
alter table public.profiles
  add column if not exists card_layout text not null default 'centred',
  add column if not exists card_theme text not null default 'lime-pulse';

alter table public.profiles drop constraint if exists profiles_card_layout_check;
alter table public.profiles add constraint profiles_card_layout_check
  check (card_layout in ('centred', 'aligned', 'photo'));
