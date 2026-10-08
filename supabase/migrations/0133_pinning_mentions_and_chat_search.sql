-- 0133_pinning_mentions_and_chat_search.sql
--
-- Three more of the basics:
--
--   1. Pin a post to the top of your profile, and a comment to the top of
--      your post.
--   2. Choose who can reach you by mentioning you.
--   3. Find a message in a chat without scrolling to it.

-- ── 1. Pinning ─────────────────────────────────────────────────────────────

alter table public.posts add column if not exists pinned_at timestamptz;
alter table public.comments add column if not exists pinned_at timestamptz;

create index if not exists posts_pinned_idx on public.posts (user_id, pinned_at desc) where pinned_at is not null;
create index if not exists comments_pinned_idx on public.comments (post_id, shot_id) where pinned_at is not null;

-- Neither is the client's to write: both go through the functions below, so
-- the caps and the "whose post is this" test cannot be stepped around.
revoke update (pinned_at) on public.posts from authenticated, anon;
revoke update (pinned_at) on public.comments from authenticated, anon;

/** How many posts one person may pin to their profile. */
create or replace function public.max_pinned_posts()
returns integer language sql immutable as $$ select 3 $$;

/**
 * Pin one of your own posts to the top of your profile, or unpin it.
 *
 * Archived work cannot be pinned: it is off every screen, so a pin would
 * be a promise the profile could not keep.
 */
create or replace function public.set_post_pinned(p_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := (select auth.uid()); v_n int; v_count int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  if p_pinned then
    select count(*) into v_count from public.posts
     where user_id = v_me and pinned_at is not null and id <> p_id;
    if v_count >= public.max_pinned_posts() then
      raise exception 'You can pin % posts. Unpin one first.', public.max_pinned_posts();
    end if;
  end if;

  update public.posts
     set pinned_at = case when p_pinned then now() else null end
   where id = p_id and user_id = v_me and archived_at is null and removed_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Not yours to pin'; end if;
end $$;

revoke all on function public.set_post_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_post_pinned(uuid, boolean) to authenticated;

/**
 * Pin a comment to the top of your own post or Shot.
 *
 * The author of the post decides, not the author of the comment — pinning
 * is the author saying "read this one". One at a time, so pinning a second
 * replaces the first rather than failing.
 */
create or replace function public.set_comment_pinned(p_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := (select auth.uid()); v_post uuid; v_shot uuid; v_owner uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  select c.post_id, c.shot_id into v_post, v_shot
    from public.comments c
   where c.id = p_id and c.deleted_at is null and c.removed_at is null;
  if v_post is null and v_shot is null then raise exception 'No such comment'; end if;

  if v_post is not null then
    select user_id into v_owner from public.posts where id = v_post;
  else
    select user_id into v_owner from public.shots where id = v_shot;
  end if;
  if v_owner is distinct from v_me then raise exception 'Only the author can pin a comment'; end if;

  -- One pinned comment per post or Shot.
  update public.comments set pinned_at = null
   where pinned_at is not null
     and ((v_post is not null and post_id = v_post) or (v_shot is not null and shot_id = v_shot));

  if p_pinned then
    update public.comments set pinned_at = now() where id = p_id;
  end if;
end $$;

revoke all on function public.set_comment_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_comment_pinned(uuid, boolean) to authenticated;

-- ── 2. Who can reach you by mentioning you ─────────────────────────────────
--
-- This governs the notification, which is what a mention actually costs the
-- person mentioned. The @ text still reads as written — the app would have
-- to ask this setting for every name in every post to do otherwise, and a
-- setting is not worth a lookup per name on every render.

alter table public.profiles
  add column if not exists mention_privacy text not null default 'everyone';

do $$
begin
  alter table public.profiles add constraint profiles_mention_privacy_ck
    check (mention_privacy in ('everyone', 'following', 'nobody'));
exception when duplicate_object then null;
end $$;

grant update (mention_privacy) on public.profiles to authenticated;

-- Nobody else's business, so it is not in the public column grant (0130).
-- Its owner reads it with the rest of their private fields.
create or replace function public.my_private_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'date_of_birth', p.date_of_birth,
    'is_admin', p.is_admin,
    'suspension_reason', p.suspension_reason,
    'notif_prefs', p.notif_prefs,
    'mention_privacy', p.mention_privacy,
    'referral_count', (select count(*) from public.profiles r where r.referred_by = p.id)
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke all on function public.my_private_profile() from public, anon;
grant execute on function public.my_private_profile() to authenticated;

/** May p_actor's mention reach p_target? */
create or replace function public.mention_allowed(p_target uuid, p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case (select mention_privacy from public.profiles where id = p_target)
    when 'nobody' then false
    -- "People I follow": the person being mentioned follows the one writing.
    when 'following' then exists (
      select 1 from public.follows f
       where f.follower_id = p_target and f.following_id = p_actor
    )
    else true
  end
$$;

revoke all on function public.mention_allowed(uuid, uuid) from public, anon;
grant execute on function public.mention_allowed(uuid, uuid) to authenticated;

create or replace function public.handle_post_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_mention text; v_target uuid;
begin
  if new.mentions is null then return new; end if;
  foreach v_mention in array new.mentions loop
    select id into v_target from public.profiles
      where lower(username) = lower(v_mention) and id <> new.user_id;
    if v_target is not null and public.mention_allowed(v_target, new.user_id) then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (v_target, new.user_id, 'mention_post', 'post', new.id, 'mentioned you in a post')
      on conflict do nothing;
    end if;
  end loop;
  return new;
end $$;

create or replace function public.handle_shot_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_mention text; v_target uuid;
begin
  if new.mentions is null then return new; end if;
  foreach v_mention in array new.mentions loop
    select id into v_target from public.profiles
      where lower(username) = lower(v_mention) and id <> new.user_id;
    if v_target is not null and public.mention_allowed(v_target, new.user_id) then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (v_target, new.user_id, 'mention_shot', 'shot', new.id, 'mentioned you in a Shot')
      on conflict do nothing;
    end if;
  end loop;
  return new;
end $$;

-- ── 3. Finding a message ───────────────────────────────────────────────────
--
-- Trigram, so a part of a word finds it and it stays fast as a chat grows.

create index if not exists messages_body_trgm_idx
  on public.messages using gin (body gin_trgm_ops)
  where body is not null and kind = 'text';

/**
 * Messages in one chat that contain this text, newest first.
 *
 * SECURITY INVOKER on purpose: the row rule on messages already answers
 * "may this person read this chat", and this must not become a way round it.
 * Notices the thread posts about itself are left out — they are not anything
 * anyone said.
 */
create or replace function public.search_messages(
  p_conversation_id uuid,
  p_q text,
  p_limit integer default 40
)
returns table (id uuid, sender_id uuid, body text, created_at timestamptz)
language sql
stable
set search_path = public
as $$
  select m.id, m.sender_id, m.body, m.created_at
    from public.messages m
   where m.conversation_id = p_conversation_id
     and m.kind = 'text'
     and not m.is_unsent
     and m.removed_at is null
     and m.body ilike '%' || btrim(p_q) || '%'
     and btrim(p_q) <> ''
   order by m.created_at desc
   limit least(greatest(coalesce(p_limit, 40), 1), 100)
$$;

revoke all on function public.search_messages(uuid, text, integer) from public, anon;
grant execute on function public.search_messages(uuid, text, integer) to authenticated;
