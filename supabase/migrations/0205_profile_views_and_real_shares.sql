-- Two things nobody was recording.
--
-- ── profile views ───────────────────────────────────────────────────────
--
-- Not recorded anywhere, in any form. A creator can see what a post did
-- and nothing at all about the page the post sends people to, which is
-- the page that turns a view into a follow.
--
-- Same shape as post_views (0043): one row per visitor per day, so the
-- table is bounded by people rather than by traffic, and a profile
-- refreshed forty times in an afternoon is one visitor.
--
-- Counts only, on purpose. The author is shown how many, never who.
-- Instagram shows neither, LinkedIn shows who; "who looked at your
-- profile" changes how it feels to look at a profile, and that is a
-- product decision to take deliberately rather than inherit from the fact
-- that the viewer id happens to be in the row. It is in the row because
-- counting distinct visitors needs it, and for no other reason.
--
-- ── shares that actually happened ───────────────────────────────────────
--
-- posts.share_count is inferred entirely from DM sends: bump_share_count()
-- fires on a messages insert of kind post or shot. So copying a link,
-- using the system share sheet, sending to WhatsApp and putting something
-- in a Show all counted as nothing, and the one number called "shares"
-- meant "times someone sent this in a Hypefy DM".
--
-- Rows rather than a daily aggregate here: a share is rare next to a view
-- — these are a handful a day where views are thousands — and knowing
-- that something went to WhatsApp eleven times and to DMs twice is the
-- whole point of recording it.

-- ── profile_views ───────────────────────────────────────────────────────

create table if not exists public.profile_views (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id  uuid not null references public.profiles(id) on delete cascade,
  viewed_on  date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (profile_id, viewer_id, viewed_on),
  constraint profile_views_not_self check (profile_id <> viewer_id)
);

create index if not exists profile_views_profile_idx
  on public.profile_views (profile_id, viewed_on);

alter table public.profile_views enable row level security;

-- Pattern A. You can see the rows about your own profile, and the rows you
-- yourself made. No insert policy, because the client writes through the
-- function below; no update or delete, because a visit is a fact.
drop policy if exists "profile_views read own" on public.profile_views;
create policy "profile_views read own"
  on public.profile_views for select to authenticated
  using (
    profile_id = (select auth.uid())
    or viewer_id = (select auth.uid())
  );

revoke all on public.profile_views from anon;
revoke all on public.profile_views from authenticated;
grant select on public.profile_views to authenticated;

create or replace function public.record_profile_view(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_me uuid := (select auth.uid());
begin
  -- No viewer, no profile, or your own: nothing to record. Looking at your
  -- own profile is the single most common profile view there is and the
  -- least interesting.
  if v_me is null or p_profile_id is null or p_profile_id = v_me then return; end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then return; end if;

  insert into public.profile_views (profile_id, viewer_id)
  values (p_profile_id, v_me)
  on conflict (profile_id, viewer_id, viewed_on) do nothing;
end $$;

revoke all on function public.record_profile_view(uuid) from public, anon;
grant execute on function public.record_profile_view(uuid) to authenticated;

-- How many, over a window. Never who.
create or replace function public.profile_view_stats(p_days int default 30)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'visits',   count(*),
    'visitors', count(distinct v.viewer_id)
  )
  from public.profile_views v
  where v.profile_id = (select auth.uid())
    and v.viewed_on >= current_date - greatest(1, least(coalesce(p_days, 30), 365));
$$;

revoke all on function public.profile_view_stats(int) from public, anon;
grant execute on function public.profile_view_stats(int) to authenticated;

-- ── share_events ────────────────────────────────────────────────────────

create table if not exists public.share_events (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'shot', 'show', 'profile')),
  target_id   uuid not null,
  sharer_id   uuid not null references public.profiles(id) on delete cascade,
  -- Where it went. Open text rather than an enum so a new share button does
  -- not need a migration; the write function holds the allowed list, which
  -- is the half that has to be trusted.
  destination text not null,
  created_at  timestamptz not null default now()
);

create index if not exists share_events_target_idx
  on public.share_events (target_type, target_id);

alter table public.share_events enable row level security;

-- The sharer sees their own; the owner of the thing shared sees the rows
-- about it. No foreign key on target_id because it points at one of three
-- tables, so ownership is resolved here instead.
drop policy if exists "share_events read own or as owner" on public.share_events;
create policy "share_events read own or as owner"
  on public.share_events for select to authenticated
  using (
    sharer_id = (select auth.uid())
    or (target_type = 'post' and exists (
          select 1 from public.posts p
           where p.id = share_events.target_id and p.user_id = (select auth.uid())))
    or (target_type = 'shot' and exists (
          select 1 from public.shots s
           where s.id = share_events.target_id and s.user_id = (select auth.uid())))
    or (target_type = 'show' and exists (
          select 1 from public.shows w
           where w.id = share_events.target_id and w.user_id = (select auth.uid())))
    or (target_type = 'profile' and share_events.target_id = (select auth.uid()))
  );

revoke all on public.share_events from anon;
revoke all on public.share_events from authenticated;
grant select on public.share_events to authenticated;

create or replace function public.record_share(
  p_target_type text,
  p_target_id   uuid,
  p_destination text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := (select auth.uid());
  v_dest text := lower(coalesce(p_destination, ''));
begin
  if v_me is null or p_target_id is null then return; end if;
  if p_target_type not in ('post', 'shot', 'show', 'profile') then return; end if;
  -- The allowed destinations live here rather than in a CHECK so adding a
  -- share button is a function change, not a constraint change — but the
  -- list is still closed, so a crafted call cannot write free text into a
  -- column that will be grouped by.
  if v_dest not in ('copy', 'native', 'whatsapp', 'show', 'dm', 'other') then
    v_dest := 'other';
  end if;

  insert into public.share_events (target_type, target_id, sharer_id, destination)
  values (p_target_type, p_target_id, v_me, v_dest);
end $$;

revoke all on function public.record_share(text, uuid, text) from public, anon;
grant execute on function public.record_share(text, uuid, text) to authenticated;

-- Where something went, for the person who made it. Counts per destination.
create or replace function public.share_breakdown(p_target_type text, p_target_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_object_agg(d.destination, d.n), '{}'::jsonb)
  from (
    select e.destination, count(*) as n
    from public.share_events e
    where e.target_type = p_target_type
      and e.target_id = p_target_id
      and (
        (p_target_type = 'post' and exists (
            select 1 from public.posts p where p.id = p_target_id and p.user_id = (select auth.uid())))
        or (p_target_type = 'shot' and exists (
            select 1 from public.shots s where s.id = p_target_id and s.user_id = (select auth.uid())))
        or (p_target_type = 'show' and exists (
            select 1 from public.shows w where w.id = p_target_id and w.user_id = (select auth.uid())))
        or (p_target_type = 'profile' and p_target_id = (select auth.uid()))
      )
    group by e.destination
  ) d;
$$;

revoke all on function public.share_breakdown(text, uuid) from public, anon;
grant execute on function public.share_breakdown(text, uuid) to authenticated;
