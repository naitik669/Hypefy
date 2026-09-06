-- Moderation could not moderate.
--
-- /admin/reports could write a status string — 'resolved' or 'dismissed' — and
-- nothing else. There was no admin-capable delete anywhere in the schema: every
-- removal path in the app is ownership-scoped (posts/shots/shows are hard
-- DELETEs behind `own delete` policies, comments soft-delete via deleted_at,
-- messages go through unsend_message which checks sender_id). So a report could
-- be marked resolved while the thing it reported was still up, and the queue
-- was not linked from anywhere in the app to begin with.
--
-- Approach: soft-delete columns plus SECURITY DEFINER RPCs gated on is_admin().
-- Not a service-role /api/admin route — that moves the authorisation decision
-- out of the database, where every other rule in this app lives, and a
-- service-role client bypasses ALL row-level security, so one missing check
-- there is a total compromise rather than a scoped one. This is only safe
-- because 0050 made the is_admin bit trustworthy; before that migration any
-- user could award it to themselves.
--
-- Soft, not hard: a wrongly-removed post has to come back, and the media is the
-- evidence the report was about.

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in
    ('remove','restore','suspend','unsuspend','grant_admin','revoke_admin','resolve','dismiss')),
  target_type text not null,
  target_id uuid not null,
  target_user_id uuid references public.profiles(id),
  reason text,
  report_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists moderation_actions_created_idx
  on public.moderation_actions (created_at desc);

alter table public.moderation_actions enable row level security;
revoke all on table public.moderation_actions from anon, authenticated;
drop policy if exists "moderation_actions: admin read" on public.moderation_actions;
create policy "moderation_actions: admin read"
  on public.moderation_actions for select to authenticated
  using (public.is_admin());
grant select on public.moderation_actions to authenticated;

-- removed_at is deliberately separate from comments.deleted_at: "the author
-- deleted this" and "we took this down" are different facts, need to be
-- independently reversible, and only one of them should survive an appeal.
alter table public.posts    add column if not exists removed_at timestamptz,
                            add column if not exists removed_by uuid references public.profiles(id),
                            add column if not exists removal_reason text;
alter table public.shots    add column if not exists removed_at timestamptz,
                            add column if not exists removed_by uuid references public.profiles(id),
                            add column if not exists removal_reason text;
alter table public.shows    add column if not exists removed_at timestamptz,
                            add column if not exists removed_by uuid references public.profiles(id),
                            add column if not exists removal_reason text;
alter table public.comments add column if not exists removed_at timestamptz,
                            add column if not exists removed_by uuid references public.profiles(id),
                            add column if not exists removal_reason text;
alter table public.messages add column if not exists removed_at timestamptz,
                            add column if not exists removed_by uuid references public.profiles(id),
                            add column if not exists removal_reason text;

-- The predicate lands on the hottest queries in the app, so it gets indexes.
create index if not exists posts_live_idx    on public.posts (created_at desc) where removed_at is null;
create index if not exists shots_live_idx    on public.shots (created_at desc) where removed_at is null;
create index if not exists shows_live_idx    on public.shows (created_at desc) where removed_at is null;
create index if not exists comments_live_idx on public.comments (created_at)   where removed_at is null;

-- REPLACE the read policies, never add alongside them. Permissive policies OR
-- together, so a second policy would silently make every takedown ineffective.
-- Each keeps its existing predicate exactly and gains the removal clause: the
-- author still sees their own removed content (so it does not just vanish
-- without explanation) and admins see everything.
alter policy "posts: anyone can read" on public.posts
  using (
    (removed_at is null or user_id = (select auth.uid()) or public.is_admin())
    and (
      user_id = (select auth.uid())
      or not exists (select 1 from public.profiles p
                      where p.id = posts.user_id and coalesce(p.is_private, false))
      or exists (select 1 from public.follows f
                  where f.following_id = posts.user_id
                    and f.follower_id = (select auth.uid()))
    )
  );

alter policy "shots: anyone can read" on public.shots
  using (
    (removed_at is null or user_id = (select auth.uid()) or public.is_admin())
    and (
      user_id = (select auth.uid())
      or not exists (select 1 from public.profiles p
                      where p.id = shots.user_id and coalesce(p.is_private, false))
      or exists (select 1 from public.follows f
                  where f.following_id = shots.user_id
                    and f.follower_id = (select auth.uid()))
    )
  );

alter policy "shows_select_public" on public.shows
  using (
    (removed_at is null or user_id = (select auth.uid()) or public.is_admin())
    and (
      user_id = (select auth.uid())
      or not exists (select 1 from public.profiles p
                      where p.id = shows.user_id and coalesce(p.is_private, false))
      or exists (select 1 from public.follows f
                  where f.following_id = shows.user_id
                    and f.follower_id = (select auth.uid()))
    )
  );

alter policy "comments: anyone can read non-deleted" on public.comments
  using (
    (deleted_at is null or user_id = (select auth.uid()))
    and (removed_at is null or user_id = (select auth.uid()) or public.is_admin())
  );

alter policy "messages: members read" on public.messages
  using (
    is_conv_member(conversation_id)
    and (removed_at is null or public.is_admin())
  );

create or replace function public.admin_remove_content(
  p_target_type text,
  p_target_id uuid,
  p_reason text default null,
  p_report_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := (select auth.uid()); v_author uuid; v_table text;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  v_table := case p_target_type
    when 'post' then 'posts' when 'shot' then 'shots' when 'show' then 'shows'
    when 'comment' then 'comments' when 'message' then 'messages' else null end;
  if v_table is null then
    raise exception 'Cannot remove a %', p_target_type;
  end if;

  -- `and removed_at is null` makes this idempotent: a double-tap in the queue
  -- reports "already removed" rather than logging a second action.
  execute format(
    'update public.%I set removed_at = now(), removed_by = $1, removal_reason = $2
       where id = $3 and removed_at is null
     returning %I', v_table,
     case when v_table = 'messages' then 'sender_id' else 'user_id' end)
  using v_me, p_reason, p_target_id into v_author;

  if v_author is null then
    raise exception 'Not found, or already removed';
  end if;

  insert into public.moderation_actions
    (actor_id, action, target_type, target_id, target_user_id, reason, report_id)
  values (v_me, 'remove', p_target_type, p_target_id, v_author, p_reason, p_report_id);

  -- Tell the author. Silent removal is how a moderation system loses the
  -- benefit of the doubt.
  insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
  values (v_author, v_me, 'content_removed', p_target_type, p_target_id,
          coalesce(p_reason, 'removed for breaking the community guidelines'));

  if p_report_id is not null then
    update public.reports set status = 'resolved' where id = p_report_id;
  end if;
end $$;

create or replace function public.admin_restore_content(
  p_target_type text,
  p_target_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := (select auth.uid()); v_author uuid; v_table text;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  v_table := case p_target_type
    when 'post' then 'posts' when 'shot' then 'shots' when 'show' then 'shows'
    when 'comment' then 'comments' when 'message' then 'messages' else null end;
  if v_table is null then
    raise exception 'Cannot restore a %', p_target_type;
  end if;

  execute format(
    'update public.%I set removed_at = null, removed_by = null, removal_reason = null
       where id = $1 and removed_at is not null
     returning %I', v_table,
     case when v_table = 'messages' then 'sender_id' else 'user_id' end)
  using p_target_id into v_author;

  if v_author is null then
    raise exception 'Not found, or not removed';
  end if;

  insert into public.moderation_actions
    (actor_id, action, target_type, target_id, target_user_id)
  values (v_me, 'restore', p_target_type, p_target_id, v_author);

  insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
  values (v_author, v_me, 'content_restored', p_target_type, p_target_id,
          'is back up — thanks for your patience');
end $$;

-- Resolving a report is itself a moderator action and should leave a record;
-- the queue used to PATCH the status column directly, so nothing said who.
create or replace function public.admin_resolve_report(
  p_table text, p_id uuid, p_status text
) returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := (select auth.uid());
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if p_table not in ('reports','message_reports') then
    raise exception 'Unknown report table %', p_table;
  end if;
  if p_status not in ('open','resolved','dismissed') then
    raise exception 'Unknown status %', p_status;
  end if;

  execute format('update public.%I set status = $1 where id = $2', p_table)
  using p_status, p_id;

  insert into public.moderation_actions (actor_id, action, target_type, target_id, report_id)
  values (v_me, case when p_status = 'dismissed' then 'dismiss' else 'resolve' end,
          p_table, p_id, p_id);
end $$;

-- message_reports.status had no CHECK, so the client could write anything into
-- it. Match the constraint `reports` has had since 0020.
update public.message_reports set status = 'open'
 where status not in ('open','resolved','dismissed');
alter table public.message_reports drop constraint if exists message_reports_status_check;
alter table public.message_reports add constraint message_reports_status_check
  check (status in ('open','resolved','dismissed'));

-- Postgres grants EXECUTE to PUBLIC by default; 0002 records that forgetting
-- this is how set_verified was left open the first time.
revoke execute on function public.admin_remove_content(text, uuid, text, uuid) from public, anon;
grant  execute on function public.admin_remove_content(text, uuid, text, uuid) to authenticated;
revoke execute on function public.admin_restore_content(text, uuid) from public, anon;
grant  execute on function public.admin_restore_content(text, uuid) to authenticated;
revoke execute on function public.admin_resolve_report(text, uuid, text) from public, anon;
grant  execute on function public.admin_resolve_report(text, uuid, text) to authenticated;
