-- Rehype: resharing a post or a Shot to your followers.
--
-- Posts already had half of this — a `reposts` table, a count, a trigger that
-- notified the owner, and a Home feed that blended in what the people you
-- follow reposted — reachable only from a button buried in the share sheet,
-- and never used. Shots had nothing. The feature is called Rehype in the app
-- (the like is a Hype); the tables keep their existing names, since renaming
-- one that three features already read would buy nothing.
--
-- This adds Shots, and closes three gaps in what posts had:
--
--   * Anyone could "repost" any post id, including a private account's. The
--     insert rule only checked the row was yours, so the owner of a private
--     post was notified about a reshare that none of the resharer's followers
--     could ever see. Now the target must be visible to you, and its author
--     must be public — or you.
--
--   * Who reposted what was readable by everyone, including a private
--     account's reposts. Rehypes now follow the same rule as posts and Shots:
--     a private account's rehypes are visible to its followers and itself.
--
--   * The notification carried no text, so it rendered as "interacted with
--     your content". Every other notification stores its sentence; so does
--     this one now.

-- ── who may see someone's activity ─────────────────────────────────────
--
-- The rule posts and shots already apply inline, as one function so the two
-- rehype tables cannot drift from it or from each other. Invoker: it reads
-- only profiles and follows, which are publicly readable, and must answer for
-- the caller, not for whoever defined it.

create or replace function public.can_see_activity_of(p_user uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_user = auth.uid()
      or not exists (
        select 1 from public.profiles p
         where p.id = p_user and coalesce(p.is_private, false)
      )
      or exists (
        select 1 from public.follows f
         where f.following_id = p_user and f.follower_id = auth.uid()
      );
$$;

comment on function public.can_see_activity_of(uuid) is
  'Whether the caller may see this person''s activity: it is them, they are public, or the caller follows them. The rule posts and shots already apply.';

-- ── posts: tighten what already existed ────────────────────────────────

drop policy if exists "reposts_select_all" on public.reposts;
create policy "reposts_select_visible" on public.reposts
  for select using (public.can_see_activity_of(user_id));

drop policy if exists "reposts_insert_own" on public.reposts;
create policy "reposts_insert_own" on public.reposts
  for insert with check (
    (select auth.uid()) = user_id
    -- Runs under the caller's RLS, so only a post they can actually see.
    and exists (
      select 1 from public.posts p
        join public.profiles a on a.id = p.user_id
       where p.id = post_id
         and (p.user_id = (select auth.uid()) or not coalesce(a.is_private, false))
    )
  );

create or replace function public.handle_repost_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  update public.posts set repost_count = repost_count + 1 where id = new.post_id
    returning user_id into v_owner;
  if v_owner is not null and v_owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (v_owner, new.user_id, 'repost', 'post', new.post_id, 'rehyped your post');
  end if;
  return new;
end $$;

-- The one repost notification that exists was written without text.
update public.notifications
   set body = case when target_type = 'shot' then 'rehyped your Shot' else 'rehyped your post' end
 where type = 'repost' and body is null;

-- ── shots ───────────────────────────────────────────────────────────────

alter table public.shots
  add column if not exists repost_count integer not null default 0;

create table if not exists public.shot_reposts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  shot_id    uuid not null references public.shots(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, shot_id)
);

comment on table public.shot_reposts is
  'Rehypes of Shots. The post equivalent is public.reposts.';

-- A profile's Rehypes tab lists one person's newest first; the count trigger
-- and the cascade look up by shot.
create index if not exists shot_reposts_user_created_idx
  on public.shot_reposts (user_id, created_at desc);
create index if not exists shot_reposts_shot_idx
  on public.shot_reposts (shot_id);

alter table public.shot_reposts enable row level security;

create policy "shot_reposts_select_visible" on public.shot_reposts
  for select using (public.can_see_activity_of(user_id));

create policy "shot_reposts_insert_own" on public.shot_reposts
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.shots s
        join public.profiles a on a.id = s.user_id
       where s.id = shot_id
         and (s.user_id = (select auth.uid()) or not coalesce(a.is_private, false))
    )
  );

create policy "shot_reposts_delete_own" on public.shot_reposts
  for delete using ((select auth.uid()) = user_id);

grant select on public.shot_reposts to anon, authenticated;
grant insert, delete on public.shot_reposts to authenticated;

-- A suspended account cannot rehype, the same as it cannot hype or repost.
drop trigger if exists block_suspended on public.shot_reposts;
create trigger block_suspended
  before insert on public.shot_reposts
  for each row execute function public.tg_block_suspended();

create or replace function public.handle_shot_repost_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  update public.shots set repost_count = repost_count + 1 where id = new.shot_id
    returning user_id into v_owner;
  if v_owner is not null and v_owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (v_owner, new.user_id, 'repost', 'shot', new.shot_id, 'rehyped your Shot');
  end if;
  return new;
end $$;

create or replace function public.handle_shot_repost_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shots set repost_count = greatest(repost_count - 1, 0) where id = old.shot_id;
  return old;
end $$;

drop trigger if exists on_shot_repost_insert on public.shot_reposts;
create trigger on_shot_repost_insert
  after insert on public.shot_reposts
  for each row execute function public.handle_shot_repost_insert();

drop trigger if exists on_shot_repost_delete on public.shot_reposts;
create trigger on_shot_repost_delete
  after delete on public.shot_reposts
  for each row execute function public.handle_shot_repost_delete();

-- ── Shots the people I follow rehyped ──────────────────────────────────
--
-- The Shots feed ranks one global window with no notion of who you follow,
-- and fetching the follow list first would put a round trip in front of the
-- first frame. This answers the whole question in one call, alongside the
-- feed's own query.
--
-- Invoker, so shots RLS decides what comes back: a removed Shot, or one from
-- a private account the caller does not follow, never appears. One row per
-- Shot, carrying its most recent rehype.

create or replace function public.followed_shot_rehypes(p_limit integer default 20)
returns table (rehyped_at timestamptz, rehyper_name text, shot jsonb)
language sql
stable
set search_path = public
as $$
  select latest.created_at,
         coalesce(rp.display_name, rp.username),
         jsonb_build_object(
           'id', s.id,
           'user_id', s.user_id,
           'media_url', s.media_url,
           'poster_url', s.poster_url,
           'caption', s.caption,
           'created_at', s.created_at,
           'hype_count', s.hype_count,
           'comment_count', s.comment_count,
           'save_count', s.save_count,
           'duration_secs', s.duration_secs,
           'trim_start', s.trim_start,
           'trim_end', s.trim_end,
           'profiles', jsonb_build_object(
             'display_name', ap.display_name,
             'avatar_hue', ap.avatar_hue,
             'avatar_url', ap.avatar_url,
             'username', ap.username
           )
         )
    from (
      select distinct on (r.shot_id) r.shot_id, r.user_id, r.created_at
        from public.shot_reposts r
        join public.follows f
          on f.following_id = r.user_id and f.follower_id = auth.uid()
       order by r.shot_id, r.created_at desc
    ) latest
    join public.shots s on s.id = latest.shot_id
    join public.profiles rp on rp.id = latest.user_id
    join public.profiles ap on ap.id = s.user_id
   -- Your own Shot coming back to you as someone else's rehype is noise.
   where s.user_id <> auth.uid()
   order by latest.created_at desc
   limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.followed_shot_rehypes(integer) from public, anon;
grant execute on function public.followed_shot_rehypes(integer) to authenticated;
