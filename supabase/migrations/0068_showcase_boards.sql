-- ─────────────────────────────────────────────────────────────────────
-- Showcase boards.
--
-- Showcase today is one flat rail: every Shot with in_showcase and every
-- Show with is_showcase, in one undifferentiated row. You cannot name a
-- group, you cannot have two, and you cannot put anything in it that was
-- not already posted publicly.
--
-- Boards replace that. A user makes as many as they like, names them, and
-- fills them with Shows and Shots they have posted OR media uploaded
-- straight into the board. Tapping one plays through it the way a Show
-- already plays — a status reel, not a gallery.
--
-- The old in_showcase / is_showcase columns are deliberately LEFT IN PLACE.
-- Nothing reads them after this, so the pins stop appearing, but the data
-- is still there and the decision stays reversible. There is exactly one
-- pinned item in the database today, so nothing meaningful is being set
-- aside either way.
-- ─────────────────────────────────────────────────────────────────────

-- ── Who may see someone's stuff ──────────────────────────────────────
--
-- The three-branch rule from 0045 — own row, author not private, accepted
-- follower — as a function, because two new tables need it and a fourth
-- hand-copied predicate is a fourth chance to get it subtly wrong.
--
-- Definer so it can read profiles and follows regardless of their own
-- policies, and executable by anon as well as authenticated: a policy runs
-- as the CALLING role, so a function it calls that anon cannot execute makes
-- the whole query ERROR rather than return nothing. 0060 exists because of
-- exactly that mistake with is_admin().
create or replace function public.can_see_profile(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_user = (select auth.uid())
    or not exists (
      select 1 from public.profiles p
      where p.id = p_user and coalesce(p.is_private, false)
    )
    or exists (
      select 1 from public.follows f
      where f.following_id = p_user and f.follower_id = (select auth.uid())
    );
$$;

revoke all on function public.can_see_profile(uuid) from public;
grant execute on function public.can_see_profile(uuid) to anon, authenticated;

-- ── The boards ───────────────────────────────────────────────────────
create table if not exists public.showcases (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  title          text not null,
  -- An explicit cover. Null means "use the first item", which is what most
  -- boards will do and what saves making people choose one to get started.
  cover_url      text,
  position       int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  removed_at     timestamptz,
  removed_by     uuid,
  removal_reason text,
  constraint showcases_title_len check (char_length(btrim(title)) between 1 and 40)
);

create index if not exists showcases_owner_idx
  on public.showcases (user_id, position, created_at);

-- ── What is in them ──────────────────────────────────────────────────
--
-- References, not copies. A pinned Show that is deleted or moderated away
-- must vanish from the board too, and denormalising its media_url here
-- would leave the board showing content the rest of the app has removed.
-- Only an 'upload' — media that exists nowhere else — carries its own url.
create table if not exists public.showcase_items (
  id             uuid primary key default gen_random_uuid(),
  showcase_id    uuid not null references public.showcases(id) on delete cascade,
  kind           text not null check (kind in ('show', 'shot', 'upload')),
  show_id        uuid references public.shows(id) on delete cascade,
  shot_id        uuid references public.shots(id) on delete cascade,
  -- Uploads only.
  media_url      text,
  poster_url     text,
  caption        text,
  position       int not null default 0,
  created_at     timestamptz not null default now(),
  removed_at     timestamptz,
  removed_by     uuid,
  removal_reason text,
  -- Exactly one source, matching the kind. Without this a row can claim to
  -- be a Show and carry a shot_id, and every reader has to guess.
  constraint showcase_items_source check (
    (kind = 'show'   and show_id is not null and shot_id is null     and media_url is null)
    or (kind = 'shot'   and shot_id is not null and show_id is null  and media_url is null)
    or (kind = 'upload' and media_url is not null and show_id is null and shot_id is null)
  )
);

create index if not exists showcase_items_board_idx
  on public.showcase_items (showcase_id, position, created_at);

-- The same thing twice in one board is a mistake every time, and the UI
-- cannot reliably prevent it across two devices.
create unique index if not exists showcase_items_unique_show
  on public.showcase_items (showcase_id, show_id) where show_id is not null;
create unique index if not exists showcase_items_unique_shot
  on public.showcase_items (showcase_id, shot_id) where shot_id is not null;

-- ── Policies ─────────────────────────────────────────────────────────
alter table public.showcases enable row level security;
alter table public.showcase_items enable row level security;

drop policy if exists "showcases: visible like their owner" on public.showcases;
create policy "showcases: visible like their owner" on public.showcases
  for select using (
    (removed_at is null or user_id = (select auth.uid()) or public.is_admin())
    and public.can_see_profile(user_id)
  );

drop policy if exists "showcases: own insert" on public.showcases;
create policy "showcases: own insert" on public.showcases
  for insert with check (user_id = (select auth.uid()));

drop policy if exists "showcases: own update" on public.showcases;
create policy "showcases: own update" on public.showcases
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "showcases: own delete" on public.showcases;
create policy "showcases: own delete" on public.showcases
  for delete using (user_id = (select auth.uid()));

-- Items inherit their board's visibility. Writes are the board owner's
-- alone, checked through the parent rather than trusting a user_id column
-- on the item, which could disagree with it.
drop policy if exists "showcase items: follow the board" on public.showcase_items;
create policy "showcase items: follow the board" on public.showcase_items
  for select using (
    (removed_at is null or public.is_admin()
      or exists (select 1 from public.showcases s
                 where s.id = showcase_id and s.user_id = (select auth.uid())))
    and exists (
      select 1 from public.showcases s
      where s.id = showcase_id
        and (s.removed_at is null or s.user_id = (select auth.uid()) or public.is_admin())
        and public.can_see_profile(s.user_id)
    )
  );

drop policy if exists "showcase items: owner writes" on public.showcase_items;
create policy "showcase items: owner writes" on public.showcase_items
  for all using (
    exists (select 1 from public.showcases s
            where s.id = showcase_id and s.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.showcases s
            where s.id = showcase_id and s.user_id = (select auth.uid()))
  );

-- updated_at, via the generic trigger 0001 already defines.
drop trigger if exists showcases_set_updated_at on public.showcases;
create trigger showcases_set_updated_at before update on public.showcases
  for each row execute function public.set_updated_at();

-- Suspension applies here as it does to every other authored table (0057).
drop trigger if exists tg_block_suspended_showcases on public.showcases;
create trigger tg_block_suspended_showcases before insert on public.showcases
  for each row execute function public.tg_block_suspended();
drop trigger if exists tg_block_suspended_showcase_items on public.showcase_items;
create trigger tg_block_suspended_showcase_items before insert on public.showcase_items
  for each row execute function public.tg_block_suspended();

-- NOTE, so it is not mistaken for finished: admin_remove_content (0055) does
-- not know these two types yet, so setting removed_at on a board or an item
-- is currently a manual SQL action. The columns and the policy predicates are
-- here so that removal WORKS the moment it is set; wiring the moderator UI to
-- it belongs with the rest of the board tooling.
