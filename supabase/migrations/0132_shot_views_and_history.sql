-- 0132_shot_views_and_history.sql
--
-- Watch history, and the way to clear it.
--
-- Posts have recorded who looked at them since 0xxx (post_views): one row per
-- person per post per day. Shots recorded nothing per viewer at all, so there
-- was no history to show and no "already watched" signal for the reel order.
-- This mirrors post_views for Shots, and gives both a way to be forgotten.

create table if not exists public.shot_views (
  shot_id uuid not null references public.shots (id) on delete cascade,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  -- One row per person per Shot per day, like post_views: scrolling back
  -- past the same Shot is the normal case, not a second watch.
  viewed_on date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (shot_id, viewer_id, viewed_on)
);

-- Newest first, for the history list.
create index if not exists shot_views_viewer_idx on public.shot_views (viewer_id, created_at desc);

alter table public.shot_views enable row level security;

drop policy if exists "shot_views insert own" on public.shot_views;
create policy "shot_views insert own" on public.shot_views for insert
  with check (viewer_id = (select auth.uid()));

-- The same two readers post_views has: the person who watched, and the
-- author of the Shot. Nobody else.
drop policy if exists "shot_views read own or as author" on public.shot_views;
create policy "shot_views read own or as author" on public.shot_views for select using (
  viewer_id = (select auth.uid())
  or exists (select 1 from public.shots s where s.id = shot_views.shot_id and s.user_id = (select auth.uid()))
);

grant select, insert on public.shot_views to authenticated;

/**
 * Forget what you watched.
 *
 * The rows are deleted, not flagged: asking to be forgotten should leave
 * nothing behind, and these rows are also what lets an author see that you
 * in particular looked. One kind at a time, or everything.
 *
 * It has a cost the screen says out loud — the feed uses the same rows to
 * avoid showing you what you have already seen, so forgetting brings some
 * of it back.
 */
create or replace function public.forget_views(p_kind text default 'all')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := (select auth.uid()); v_n int := 0; v_k int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('post', 'shot', 'all') then raise exception 'Unknown kind: %', p_kind; end if;

  if p_kind in ('post', 'all') then
    delete from public.post_views where viewer_id = v_me;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end if;
  if p_kind in ('shot', 'all') then
    delete from public.shot_views where viewer_id = v_me;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end if;
  return v_n;
end $$;

revoke all on function public.forget_views(text) from public, anon;
grant execute on function public.forget_views(text) to authenticated;

/** Forget one thing you watched, without clearing the rest. */
create or replace function public.forget_one_view(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_kind = 'post' then
    delete from public.post_views where viewer_id = v_me and post_id = p_id;
  elsif p_kind = 'shot' then
    delete from public.shot_views where viewer_id = v_me and shot_id = p_id;
  else
    raise exception 'Unknown kind: %', p_kind;
  end if;
end $$;

revoke all on function public.forget_one_view(text, uuid) from public, anon;
grant execute on function public.forget_one_view(text, uuid) to authenticated;
