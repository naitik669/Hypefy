-- 0131_archive_edit_and_comment_controls.sql
--
-- The basics a finished social app is expected to have, and one hole found
-- while adding them.
--
--   1. Archive: take a post or Shot off everything without deleting it.
--   2. Comments off: stop new comments on one post or Shot.
--   3. Edit a comment, marked as edited.
--   4. Nobody can write their own counters, or undo an admin's removal.

-- ── 1. Archive ─────────────────────────────────────────────────────────────
--
-- Archived is invisible to everyone, its owner included: the row rule hides
-- it, so every query the app already makes — feeds, profiles, search, tags,
-- sounds, shared-in-chat — drops it with no change at the call site. The
-- owner reaches their archive through my_archive() and nowhere else.

alter table public.posts add column if not exists archived_at timestamptz;
alter table public.shots add column if not exists archived_at timestamptz;

create index if not exists posts_archived_idx on public.posts (user_id, archived_at desc) where archived_at is not null;
create index if not exists shots_archived_idx on public.shots (user_id, archived_at desc) where archived_at is not null;

drop policy if exists "posts: anyone can read" on public.posts;
create policy "posts: anyone can read" on public.posts for select using (
  archived_at is null
  and (removed_at is null or user_id = (select auth.uid()) or is_admin())
  and (
    user_id = (select auth.uid())
    or not exists (select 1 from profiles p where p.id = posts.user_id and coalesce(p.is_private, false))
    or exists (select 1 from follows f where f.following_id = posts.user_id and f.follower_id = (select auth.uid()))
  )
);

drop policy if exists "shots: anyone can read" on public.shots;
create policy "shots: anyone can read" on public.shots for select using (
  archived_at is null
  and (removed_at is null or user_id = (select auth.uid()) or is_admin())
  and (
    user_id = (select auth.uid())
    or not exists (select 1 from profiles p where p.id = shots.user_id and coalesce(p.is_private, false))
    or exists (select 1 from follows f where f.following_id = shots.user_id and f.follower_id = (select auth.uid()))
  )
);

/** Put one of your own posts or Shots into your archive, or take it back out. */
create or replace function public.set_archived(p_kind text, p_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := (select auth.uid()); v_n int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_kind = 'post' then
    update public.posts set archived_at = case when p_archived then now() else null end
     where id = p_id and user_id = v_me;
  elsif p_kind = 'shot' then
    update public.shots set archived_at = case when p_archived then now() else null end
     where id = p_id and user_id = v_me;
  else
    raise exception 'Unknown kind: %', p_kind;
  end if;
  get diagnostics v_n = row_count;
  -- Says the same thing whether it is someone else's or does not exist.
  if v_n = 0 then raise exception 'Not yours to archive'; end if;
end $$;

revoke all on function public.set_archived(text, uuid, boolean) from public, anon;
grant execute on function public.set_archived(text, uuid, boolean) to authenticated;

/** Everything the caller has archived, newest first. */
create or replace function public.my_archive()
returns table (
  kind text,
  id uuid,
  caption text,
  thumb text,
  media_url text,
  archived_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select 'post', p.id, coalesce(nullif(btrim(p.caption), ''), p.body),
         coalesce(p.image_urls[1], p.image_url), null::text, p.archived_at
    from public.posts p
   where p.user_id = (select auth.uid()) and p.archived_at is not null
  union all
  select 'shot', s.id, s.caption, s.poster_url, s.media_url, s.archived_at
    from public.shots s
   where s.user_id = (select auth.uid()) and s.archived_at is not null
  order by 6 desc
$$;

revoke all on function public.my_archive() from public, anon;
grant execute on function public.my_archive() to authenticated;

-- ── 2. Comments off ────────────────────────────────────────────────────────
--
-- The comments already there stay readable; no new ones are taken. Enforced
-- on the table, not only in create_comment, so writing the row directly is
-- refused the same way.

alter table public.posts add column if not exists comments_off boolean not null default false;
alter table public.shots add column if not exists comments_off boolean not null default false;

create or replace function public.tg_comments_refuse_when_off()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_off boolean; v_owner uuid;
begin
  if new.post_id is not null then
    select comments_off, user_id into v_off, v_owner from public.posts where id = new.post_id;
  elsif new.shot_id is not null then
    select comments_off, user_id into v_off, v_owner from public.shots where id = new.shot_id;
  else
    return new;
  end if;
  -- Its author can still answer the people who commented before it was shut.
  if coalesce(v_off, false) and new.user_id is distinct from v_owner then
    raise exception 'Comments are off for this post';
  end if;
  return new;
end $$;

revoke all on function public.tg_comments_refuse_when_off() from public, anon, authenticated;

drop trigger if exists comments_refuse_when_off on public.comments;
create trigger comments_refuse_when_off before insert on public.comments
  for each row execute function public.tg_comments_refuse_when_off();

/** Turn comments off, or back on, for one of your own posts or Shots. */
create or replace function public.set_comments_off(p_kind text, p_id uuid, p_off boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := (select auth.uid()); v_n int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_kind = 'post' then
    update public.posts set comments_off = p_off where id = p_id and user_id = v_me;
  elsif p_kind = 'shot' then
    update public.shots set comments_off = p_off where id = p_id and user_id = v_me;
  else
    raise exception 'Unknown kind: %', p_kind;
  end if;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Not yours'; end if;
end $$;

revoke all on function public.set_comments_off(text, uuid, boolean) from public, anon;
grant execute on function public.set_comments_off(text, uuid, boolean) to authenticated;

-- ── 3. Editing a comment ───────────────────────────────────────────────────
--
-- The time is stamped by the database on any change to the words, so a
-- comment cannot be edited without saying so.

create or replace function public.tg_comments_mark_edited()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.body is distinct from old.body then new.updated_at = now(); end if;
  -- What a comment is attached to never changes.
  new.post_id = old.post_id;
  new.shot_id = old.shot_id;
  new.parent_id = old.parent_id;
  new.created_at = old.created_at;
  return new;
end $$;

drop trigger if exists comments_mark_edited on public.comments;
create trigger comments_mark_edited before update on public.comments
  for each row execute function public.tg_comments_mark_edited();

/** Change the words of your own comment. */
create or replace function public.edit_comment(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := (select auth.uid()); v_n int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'A comment cannot be empty'; end if;
  update public.comments
     set body = btrim(p_body)
   where id = p_id and user_id = v_me and deleted_at is null and removed_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Not yours to edit'; end if;
end $$;

revoke all on function public.edit_comment(uuid, text) from public, anon;
grant execute on function public.edit_comment(uuid, text) to authenticated;

-- ── 4. Counters and moderation are the database's, not the client's ────────
--
-- `authenticated` could update every column of their own row. So anyone
-- could set their own post's hype_count to a million — which the feed ranker
-- reads — or clear removed_at and put a post an admin had taken down back in
-- front of everyone. Nothing in the app writes these: counts come from
-- triggers and RPCs, moderation from admin-only functions.

-- Table-wide UPDATE first, or a column revoke changes nothing: the broad
-- grant still covers every column. Then back by name, as profiles already
-- does. A column added later is not writable until it is granted here.

revoke update on public.posts from authenticated, anon;
grant update (
  caption, body, image_url, image_urls, hashtags, mentions,
  track, poll, aspect_ratio, updated_at
) on public.posts to authenticated;

revoke update on public.shots from authenticated, anon;
grant update (
  caption, media_url, poster_url, in_showcase, track, hashtags,
  mentions, duration_secs, trim_start, trim_end
) on public.shots to authenticated;

revoke update on public.comments from authenticated, anon;
grant update (body, image_url, deleted_at, updated_at) on public.comments to authenticated;
