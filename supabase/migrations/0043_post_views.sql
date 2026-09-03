-- Per-viewer post impressions.
--
-- Today feed impressions are invisible. increment_post_view() is a bare
-- counter with no viewer and no timestamp, and the only thing that calls it
-- is ViewPing on the post permalink and the profile modal — never a home-feed
-- card. So the ranker can see that a post was hyped but not that a hundred
-- people scrolled past it, which is the single most useful thing it could
-- know.
--
-- This changes no ranking today. It starts the clock: feedScore cannot use a
-- signal that was never recorded, and a month of history has to exist before
-- any of it is worth reading.
--
-- Deliberately one row per (post, viewer, day), not per scroll. A feed card
-- can enter the viewport many times in a session; storing each one buys
-- nothing and makes the table grow with scrolling rather than with reach.

create table if not exists public.post_views (
  post_id    uuid not null references public.posts(id) on delete cascade,
  viewer_id  uuid not null references auth.users(id)   on delete cascade,
  viewed_on  date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (post_id, viewer_id, viewed_on)
);

-- Author-side reads ("who saw my post") and the eventual ranking rollup both
-- go by post, so that is the index worth having beyond the PK.
create index if not exists post_views_post_idx
  on public.post_views (post_id, viewed_on desc);

alter table public.post_views enable row level security;

-- Insert only your own impressions. There is deliberately no UPDATE or DELETE
-- policy: an impression is a fact, and letting a client rewrite it would make
-- the whole table untrustworthy as a ranking input.
drop policy if exists "post_views insert own" on public.post_views;
create policy "post_views insert own" on public.post_views
  for insert to authenticated
  with check (viewer_id = auth.uid());

-- Authors can see views on their own posts; viewers can see their own rows.
-- Nobody can read anyone else's browsing.
drop policy if exists "post_views read own or as author" on public.post_views;
create policy "post_views read own or as author" on public.post_views
  for select to authenticated
  using (
    viewer_id = auth.uid()
    or exists (
      select 1 from public.posts p
      where p.id = post_views.post_id and p.user_id = auth.uid()
    )
  );

grant select, insert on public.post_views to authenticated;

-- Supabase's default privileges hand anon and authenticated ALL on any new
-- table, so the grant above was additive rather than exhaustive. RLS already
-- denies anon (it has no policy), but leaving the grant in place means one
-- future policy away from an anonymous write. Grants and policies are two
-- separate locks; close both.
revoke all on public.post_views from anon;
revoke all on public.post_views from authenticated;
grant select, insert on public.post_views to authenticated;
