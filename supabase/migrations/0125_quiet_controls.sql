-- Three ways to make your own Hypefy quieter without blocking anyone.
--
-- Until now the only tool was Block, which is mutual, visible in effect, and
-- far heavier than "I would rather not see this". These are the lighter ones
-- every social app is expected to have:
--
--   mute        someone's posts, Shots and Shows leave your feeds. You still
--               follow each other, they can still message you, and they are
--               not told.
--   hide        one post or Shot leaves your feeds ("Not interested").
--   remove      someone stops following you, without being blocked.
--
-- Muting and hiding are yours alone: the rows are readable only by you, and
-- written only through the functions below.

create table if not exists public.muted_users (
  muter_id uuid not null references public.profiles(id) on delete cascade,
  muted_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);
create index if not exists muted_users_muted_idx on public.muted_users (muted_id);
alter table public.muted_users enable row level security;
drop policy if exists "muted_users: own read" on public.muted_users;
create policy "muted_users: own read" on public.muted_users
  for select to authenticated using ((select auth.uid()) = muter_id);
drop policy if exists "muted_users: own delete" on public.muted_users;
create policy "muted_users: own delete" on public.muted_users
  for delete to authenticated using ((select auth.uid()) = muter_id);
revoke all on public.muted_users from anon, authenticated;
grant select, delete on public.muted_users to authenticated;

create table if not exists public.hidden_content (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('post', 'shot')),
  content_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, content_id)
);
alter table public.hidden_content enable row level security;
drop policy if exists "hidden_content: own read" on public.hidden_content;
create policy "hidden_content: own read" on public.hidden_content
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "hidden_content: own delete" on public.hidden_content;
create policy "hidden_content: own delete" on public.hidden_content
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.hidden_content from anon, authenticated;
grant select, delete on public.hidden_content to authenticated;

create or replace function public.mute_user(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_target is null or p_target = v_uid then raise exception 'You can''t mute yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_target) then raise exception 'No such person'; end if;
  insert into public.muted_users (muter_id, muted_id) values (v_uid, p_target) on conflict do nothing;
end $$;

create or replace function public.hide_content(p_kind text, p_content_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('post', 'shot') or p_content_id is null then raise exception 'That can''t be hidden'; end if;
  insert into public.hidden_content (user_id, kind, content_id) values (v_uid, p_kind, p_content_id)
  on conflict do nothing;
  -- Keep the list from growing without end: the newest 500 are plenty, and
  -- anything older has long since left every feed on its own.
  delete from public.hidden_content h
   where h.user_id = v_uid
     and (h.kind, h.content_id) in (
       select kind, content_id from public.hidden_content
        where user_id = v_uid order by created_at desc offset 500);
end $$;

-- Everything a feed should leave out for the person asking, in one call.
create or replace function public.feed_exclusions()
returns table (muted uuid[], posts uuid[], shots uuid[])
language sql stable security definer set search_path = public as $$
  select
    coalesce((select array_agg(muted_id) from public.muted_users where muter_id = (select auth.uid())), '{}'),
    coalesce((select array_agg(content_id) from public.hidden_content
               where user_id = (select auth.uid()) and kind = 'post'), '{}'),
    coalesce((select array_agg(content_id) from public.hidden_content
               where user_id = (select auth.uid()) and kind = 'shot'), '{}');
$$;

-- Row security lets only the follower delete a follow. This is the other
-- side's way to end it. They are not told; if your account is private they
-- have to ask again, and if it is public they can simply follow again, which
-- is what Block is for.
create or replace function public.remove_follower(p_follower uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  delete from public.follows where follower_id = p_follower and following_id = v_uid;
  get diagnostics v_n = row_count;
  -- The "started following you" notice goes with it, as unfollowing does.
  delete from public.notifications
   where user_id = v_uid and actor_id = p_follower and type in ('follow', 'follow_request');
  return v_n > 0;
end $$;

revoke all on function public.mute_user(uuid), public.hide_content(text, uuid),
  public.feed_exclusions(), public.remove_follower(uuid) from public, anon;
grant execute on function public.mute_user(uuid), public.hide_content(text, uuid),
  public.feed_exclusions(), public.remove_follower(uuid) to authenticated;
