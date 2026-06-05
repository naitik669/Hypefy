-- ============================================================================
-- Hypefy — reproducible Supabase schema (tables, RLS, indexes, RPCs, triggers)
-- ----------------------------------------------------------------------------
-- This file documents and recreates the backend the app depends on. It is
-- idempotent (IF NOT EXISTS / CREATE OR REPLACE) so it can be re-run safely.
-- Storage buckets are configured at the end. NEVER use the service-role key on
-- the client — every write goes through RLS or a SECURITY DEFINER RPC below.
--
-- Terminology: Hype = like · Shot = short video reel · Show = 24h story
-- (a separate feature kept internally as `shows`) · Discover = explore.
-- ============================================================================

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  bio text,
  avatar_url text,
  avatar_hue int,
  banner_url text,
  banner_id text,
  profile_tags text[] default '{}',
  profile_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  caption text,
  body text,
  image_url text,
  image_urls text[],
  hashtags text[] default '{}',
  mentions text[] default '{}',
  hype_count int default 0,
  comment_count int default 0,
  save_count int not null default 0,
  share_count int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Shots = short video reels (user-facing "Shots").
create table if not exists public.shots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  media_url text not null,
  poster_url text,
  caption text,
  hype_count int default 0,
  comment_count int default 0,
  save_count int not null default 0,
  share_count int not null default 0,
  in_showcase boolean default false,
  created_at timestamptz default now()
);

-- Shows = 24h stories (distinct feature; UI never calls these "Shots").
create table if not exists public.shows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  media_url text not null,
  caption text,
  hype_count int default 0,
  expires_at timestamptz default (now() + interval '24 hours'),
  created_at timestamptz default now()
);

create table if not exists public.hypes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','shot','comment','show')),
  target_id uuid not null,
  created_at timestamptz default now(),
  unique (user_id, target_type, target_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  shot_id uuid references public.shots(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null,
  hype_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.saved_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, post_id)
);

create table if not exists public.saved_shots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  shot_id uuid references public.shots(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, shot_id)
);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid references public.profiles(id) on delete cascade,
  following_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'dm' check (type in ('dm','group')),
  title text,
  created_by uuid references public.profiles(id) on delete set null,
  last_message_id uuid,
  last_message_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text default 'member',
  last_read_at timestamptz,
  created_at timestamptz default now(),
  unique (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete cascade,
  body text,
  kind text default 'text' check (kind in ('text','post','shot','image')),
  post_id uuid references public.posts(id) on delete set null,
  shot_id uuid references public.shots(id) on delete set null,
  reply_to_id uuid references public.messages(id) on delete set null,
  is_unsent boolean default false,
  unsent_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  unique (message_id, user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete cascade,
  type text not null,
  target_type text,
  target_id uuid,
  body text,
  is_read boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  caller_id uuid references public.profiles(id) on delete cascade,
  receiver_id uuid references public.profiles(id) on delete cascade,
  type text not null check (type in ('audio','video')),
  status text not null default 'ringing'
    check (status in ('ringing','accepted','declined','missed','ended','busy','failed')),
  quick_reply text,
  started_at timestamptz default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  reason text,
  details text,
  status text not null default 'pending',
  created_at timestamptz default now(),
  unique (reporter_id, target_type, target_id)
);

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  reason text,
  details text,
  created_at timestamptz default now(),
  unique (message_id, reporter_id)
);

-- ─── Indexes (hot paths) ────────────────────────────────────────────────────

create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists posts_user_id_idx on public.posts(user_id);
create index if not exists shots_created_at_idx on public.shots(created_at desc);
create index if not exists shots_user_id_idx on public.shots(user_id);
create index if not exists notifications_user_read_idx on public.notifications(user_id, is_read, created_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists conversations_last_message_idx on public.conversations(last_message_at desc);
create index if not exists conversation_members_user_idx on public.conversation_members(user_id);
create index if not exists conversation_members_conversation_user_idx on public.conversation_members(conversation_id, user_id);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at desc);
create index if not exists messages_sender_idx on public.messages(sender_id);
create index if not exists hypes_target_idx on public.hypes(target_type, target_id);
create index if not exists hypes_user_target_idx on public.hypes(user_id, target_type, target_id);
create index if not exists saved_posts_user_idx on public.saved_posts(user_id);
create index if not exists saved_shots_user_idx on public.saved_shots(user_id);
create index if not exists follows_follower_idx on public.follows(follower_id);
create index if not exists follows_following_idx on public.follows(following_id);
create index if not exists comments_post_idx on public.comments(post_id, created_at);
create index if not exists comments_shot_idx on public.comments(shot_id, created_at);
create index if not exists call_sessions_receiver_idx on public.call_sessions(receiver_id, status);
create index if not exists call_sessions_caller_idx on public.call_sessions(caller_id, status);

-- ─── Row Level Security ─────────────────────────────────────────────────────
-- Enable RLS on every table. Representative policies below; reads are scoped to
-- the owner or conversation members, writes require auth.uid() ownership.

alter table public.profiles            enable row level security;
alter table public.posts               enable row level security;
alter table public.shots               enable row level security;
alter table public.shows               enable row level security;
alter table public.hypes               enable row level security;
alter table public.comments            enable row level security;
alter table public.saved_posts         enable row level security;
alter table public.saved_shots         enable row level security;
alter table public.follows             enable row level security;
alter table public.conversations       enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages            enable row level security;
alter table public.message_reactions   enable row level security;
alter table public.notifications       enable row level security;
alter table public.call_sessions       enable row level security;
alter table public.reports             enable row level security;
alter table public.message_reports     enable row level security;

-- profiles: anyone can read; users edit only their own row.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid());

-- posts / shots: readable by all authed users; writable by owner.
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated using (true);
drop policy if exists posts_write_own on public.posts;
create policy posts_write_own on public.posts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists shots_read on public.shots;
create policy shots_read on public.shots for select to authenticated using (true);
drop policy if exists shots_write_own on public.shots;
create policy shots_write_own on public.shots for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- hypes / saves / follows: readable; users manage only their own.
drop policy if exists hypes_read on public.hypes;
create policy hypes_read on public.hypes for select to authenticated using (true);
drop policy if exists hypes_write_own on public.hypes;
create policy hypes_write_own on public.hypes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists saved_posts_own on public.saved_posts;
create policy saved_posts_own on public.saved_posts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists saved_shots_own on public.saved_shots;
create policy saved_shots_own on public.saved_shots for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select to authenticated using (true);
drop policy if exists follows_write_own on public.follows;
create policy follows_write_own on public.follows for all to authenticated using (follower_id = auth.uid()) with check (follower_id = auth.uid());

-- comments: readable; users manage their own.
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select to authenticated using (true);
drop policy if exists comments_write_own on public.comments;
create policy comments_write_own on public.comments for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- conversations / members / messages: scoped to membership via is_conv_member().
drop policy if exists conv_member_read on public.conversations;
create policy conv_member_read on public.conversations for select to authenticated using (public.is_conv_member(id));
drop policy if exists conv_members_read on public.conversation_members;
create policy conv_members_read on public.conversation_members for select to authenticated using (public.is_conv_member(conversation_id));
drop policy if exists conv_members_self on public.conversation_members;
create policy conv_members_self on public.conversation_members for update to authenticated using (user_id = auth.uid());
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated using (public.is_conv_member(conversation_id));
drop policy if exists messages_send on public.messages;
create policy messages_send on public.messages for insert to authenticated with check (sender_id = auth.uid() and public.is_conv_member(conversation_id));
drop policy if exists reactions_read on public.message_reactions;
create policy reactions_read on public.message_reactions for select to authenticated using (true);

-- notifications: owner-only read/update; authed insert (client follow + RPCs).
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated using (user_id = auth.uid());
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated with check (true);

-- calls: only caller/receiver can see and update.
drop policy if exists calls_select_party on public.call_sessions;
create policy calls_select_party on public.call_sessions for select to authenticated using (caller_id = auth.uid() or receiver_id = auth.uid());
drop policy if exists calls_insert_caller on public.call_sessions;
create policy calls_insert_caller on public.call_sessions for insert to authenticated with check (caller_id = auth.uid());
drop policy if exists calls_update_party on public.call_sessions;
create policy calls_update_party on public.call_sessions for update to authenticated using (caller_id = auth.uid() or receiver_id = auth.uid());

-- reports: file your own, see your own.
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports for select to authenticated using (reporter_id = auth.uid());

-- ─── Helper functions ───────────────────────────────────────────────────────

create or replace function public.is_conv_member(conv uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv and user_id = auth.uid()
  );
$$;

create or replace function public.set_updated_at()
  returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create or replace function public.handle_new_user()
  returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end; $$;

create or replace function public.touch_conversation()
  returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  update public.conversations set last_message_at = now() where id = new.conversation_id;
  return new;
end; $$;

-- ─── Engagement RPCs ────────────────────────────────────────────────────────

create or replace function public.toggle_hype(p_target_type text, p_target_id uuid, p_owner_id uuid default null)
  returns json language plpgsql security definer set search_path to 'public'
as $$
declare v_user uuid := auth.uid(); v_exists uuid; v_hyped boolean; v_count int := 0;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select id into v_exists from public.hypes
    where user_id = v_user and target_type = p_target_type and target_id = p_target_id;
  if v_exists is not null then
    delete from public.hypes where id = v_exists; v_hyped := false;
  else
    insert into public.hypes (user_id, target_type, target_id) values (v_user, p_target_type, p_target_id);
    v_hyped := true;
    if p_owner_id is not null and p_owner_id <> v_user then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (p_owner_id, v_user,
              case p_target_type when 'post' then 'hype_post' else 'hype_shot' end,
              p_target_type, p_target_id, 'hyped your post') on conflict do nothing;
    end if;
  end if;
  select count(*) into v_count from public.hypes where target_type = p_target_type and target_id = p_target_id;
  if p_target_type = 'post' then update public.posts set hype_count = v_count where id = p_target_id;
  elsif p_target_type = 'shot' then update public.shots set hype_count = v_count where id = p_target_id;
  elsif p_target_type = 'show' then update public.shows set hype_count = v_count where id = p_target_id;
  end if;
  return json_build_object('hyped', v_hyped, 'hype_count', v_count);
end; $$;

create or replace function public.create_comment(p_post_id uuid, p_body text, p_owner_id uuid default null, p_parent_id uuid default null)
  returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  insert into public.comments (post_id, user_id, body, parent_id)
    values (p_post_id, v_user, trim(p_body), p_parent_id) returning id into v_id;
  update public.posts set comment_count = (
    select count(*) from public.comments where post_id = p_post_id and deleted_at is null
  ) where id = p_post_id;
  if p_parent_id is null and p_owner_id is not null and p_owner_id <> v_user then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (p_owner_id, v_user, 'comment_post', 'post', p_post_id, 'commented on your post') on conflict do nothing;
  end if;
  return v_id;
end; $$;

create or replace function public.create_shot_comment(p_shot_id uuid, p_body text, p_owner_id uuid default null, p_parent_id uuid default null)
  returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  insert into public.comments (shot_id, user_id, body, parent_id)
    values (p_shot_id, v_user, trim(p_body), p_parent_id) returning id into v_id;
  update public.shots set comment_count = (
    select count(*) from public.comments where shot_id = p_shot_id and deleted_at is null
  ) where id = p_shot_id;
  if p_parent_id is null and p_owner_id is not null and p_owner_id <> v_user then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (p_owner_id, v_user, 'comment_shot', 'shot', p_shot_id, 'commented on your Shot') on conflict do nothing;
  end if;
  return v_id;
end; $$;

-- ─── Save / share count maintenance (triggers) ──────────────────────────────

create or replace function public.bump_post_save_count()
  returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then update public.posts set save_count = save_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then update public.posts set save_count = greatest(save_count - 1, 0) where id = old.post_id;
  end if; return null;
end; $$;

create or replace function public.bump_shot_save_count()
  returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then update public.shots set save_count = save_count + 1 where id = new.shot_id;
  elsif tg_op = 'DELETE' then update public.shots set save_count = greatest(save_count - 1, 0) where id = old.shot_id;
  end if; return null;
end; $$;

create or replace function public.bump_share_count()
  returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.kind = 'post' and new.post_id is not null then update public.posts set share_count = share_count + 1 where id = new.post_id;
  elsif new.kind = 'shot' and new.shot_id is not null then update public.shots set share_count = share_count + 1 where id = new.shot_id;
  end if; return null;
end; $$;

-- ─── Messaging RPCs ─────────────────────────────────────────────────────────

create or replace function public.get_or_create_dm(p_other uuid)
  returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_me uuid := auth.uid(); v_conv uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if v_me = p_other then raise exception 'Cannot DM yourself'; end if;
  select cm1.conversation_id into v_conv
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm1.conversation_id = cm2.conversation_id
  where cm1.user_id = v_me and cm2.user_id = p_other
    and (select count(*) from public.conversation_members cm where cm.conversation_id = cm1.conversation_id) = 2
  limit 1;
  if v_conv is not null then return v_conv; end if;
  insert into public.conversations default values returning id into v_conv;
  insert into public.conversation_members (conversation_id, user_id) values (v_conv, v_me), (v_conv, p_other);
  return v_conv;
end; $$;

create or replace function public.create_group(p_title text, p_member_ids uuid[])
  returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_me uuid := auth.uid(); v_conv uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if coalesce(array_length(p_member_ids, 1), 0) < 1 then raise exception 'Add at least one member'; end if;
  insert into public.conversations (type, title, created_by)
    values ('group', nullif(btrim(p_title), ''), v_me) returning id into v_conv;
  insert into public.conversation_members (conversation_id, user_id, role) values (v_conv, v_me, 'admin');
  insert into public.conversation_members (conversation_id, user_id, role)
    select distinct v_conv, x, 'member' from unnest(p_member_ids) as x where x <> v_me
    on conflict (conversation_id, user_id) do nothing;
  return v_conv;
end; $$;

create or replace function public.send_message(p_conversation_id uuid, p_body text default null, p_kind text default 'text', p_post_id uuid default null, p_reply_to_id uuid default null, p_shot_id uuid default null)
  returns json language plpgsql security definer set search_path to 'public'
as $$
declare v_me uuid := auth.uid(); v_msg public.messages%rowtype; v_prev_count int; v_other uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.is_conv_member(p_conversation_id) then raise exception 'Not a member'; end if;
  if (p_body is null or btrim(p_body) = '') and p_post_id is null and p_shot_id is null then raise exception 'Empty message'; end if;
  select count(*) into v_prev_count from public.messages where conversation_id = p_conversation_id;
  insert into public.messages (conversation_id, sender_id, body, kind, post_id, shot_id, reply_to_id)
    values (p_conversation_id, v_me, nullif(btrim(p_body), ''), p_kind, p_post_id, p_shot_id, p_reply_to_id)
    returning * into v_msg;
  update public.conversations set last_message_at = now(), last_message_id = v_msg.id, updated_at = now()
    where id = p_conversation_id;
  select user_id into v_other from public.conversation_members
    where conversation_id = p_conversation_id and user_id <> v_me limit 1;
  if v_other is not null and (v_prev_count = 0 or p_kind in ('post','shot')) then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (v_other, v_me,
      case when p_kind in ('post','shot') then 'dm_post_shared' else 'new_message' end,
      'conversation', p_conversation_id,
      case when p_kind = 'post' then 'shared a post with you'
           when p_kind = 'shot' then 'shared a Shot with you'
           else 'sent you a message' end);
  end if;
  return json_build_object('id', v_msg.id, 'conversation_id', v_msg.conversation_id, 'sender_id', v_msg.sender_id,
    'body', v_msg.body, 'kind', v_msg.kind, 'post_id', v_msg.post_id, 'shot_id', v_msg.shot_id,
    'reply_to_id', v_msg.reply_to_id, 'is_unsent', v_msg.is_unsent, 'created_at', v_msg.created_at);
end; $$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
  returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then return; end if;
  update public.conversation_members set last_read_at = now()
    where conversation_id = p_conversation_id and user_id = v_me;
end; $$;

create or replace function public.toggle_reaction(p_message_id uuid, p_emoji text)
  returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_me uuid := auth.uid(); v_conv uuid; v_existing text;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  select conversation_id into v_conv from public.messages where id = p_message_id;
  if v_conv is null or not public.is_conv_member(v_conv) then raise exception 'Not allowed'; end if;
  select emoji into v_existing from public.message_reactions where message_id = p_message_id and user_id = v_me;
  if v_existing is not null and v_existing = p_emoji then
    delete from public.message_reactions where message_id = p_message_id and user_id = v_me;
  else
    insert into public.message_reactions (message_id, user_id, emoji) values (p_message_id, v_me, p_emoji)
      on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  end if;
end; $$;

create or replace function public.unsend_message(p_message_id uuid)
  returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  update public.messages set is_unsent = true, body = null, metadata = '{}'::jsonb, unsent_at = now()
    where id = p_message_id and sender_id = v_me;
  if not found then raise exception 'Cannot unsend'; end if;
end; $$;

create or replace function public.report_message(p_message_id uuid, p_reason text, p_details text default null)
  returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_me uuid := auth.uid(); v_conv uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  select conversation_id into v_conv from public.messages where id = p_message_id;
  if v_conv is null or not public.is_conv_member(v_conv) then raise exception 'Cannot report'; end if;
  insert into public.message_reports (message_id, reporter_id, conversation_id, reason, details)
    values (p_message_id, v_me, v_conv, p_reason, p_details) on conflict (message_id, reporter_id) do nothing;
end; $$;

create or replace function public.mark_notifications_read()
  returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  update public.notifications set is_read = true where user_id = auth.uid() and is_read = false;
end; $$;

-- ─── Calling RPCs (1:1 audio/video) ─────────────────────────────────────────

create or replace function public.start_call(p_conversation_id uuid, p_receiver_id uuid, p_type text)
  returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_id uuid; v_caller uuid := auth.uid();
begin
  if v_caller is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from conversation_members where conversation_id = p_conversation_id and user_id = v_caller) then raise exception 'not a member'; end if;
  if not exists (select 1 from conversation_members where conversation_id = p_conversation_id and user_id = p_receiver_id) then raise exception 'receiver not a member'; end if;
  insert into call_sessions (conversation_id, caller_id, receiver_id, type, status)
    values (p_conversation_id, v_caller, p_receiver_id, p_type, 'ringing') returning id into v_id;
  insert into notifications (user_id, actor_id, type, target_type, target_id, body)
    values (p_receiver_id, v_caller, 'incoming_call', 'conversation', p_conversation_id, 'is calling you');
  return v_id;
end; $$;

create or replace function public.accept_call(p_call_id uuid)
  returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  update call_sessions set status = 'accepted', answered_at = now()
    where id = p_call_id and receiver_id = auth.uid() and status = 'ringing';
end; $$;

create or replace function public.decline_call(p_call_id uuid)
  returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  update call_sessions set status = 'declined', ended_at = now()
    where id = p_call_id and receiver_id = auth.uid() and status = 'ringing';
end; $$;

create or replace function public.quick_reply_call(p_call_id uuid, p_reply text)
  returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_conv uuid; v_me uuid := auth.uid();
begin
  select conversation_id into v_conv from call_sessions where id = p_call_id and receiver_id = v_me and status = 'ringing';
  if v_conv is null then return; end if;
  insert into messages (conversation_id, sender_id, body, kind) values (v_conv, v_me, p_reply, 'text');
  update call_sessions set status = 'declined', quick_reply = p_reply, ended_at = now() where id = p_call_id;
end; $$;

create or replace function public.end_call(p_call_id uuid)
  returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  update call_sessions set status = 'ended', ended_at = now()
    where id = p_call_id and (caller_id = auth.uid() or receiver_id = auth.uid()) and status in ('ringing','accepted');
end; $$;

create or replace function public.mark_call_missed(p_call_id uuid)
  returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_recv uuid; v_caller uuid; v_conv uuid; v_type text; v_status text;
begin
  select receiver_id, caller_id, conversation_id, type, status into v_recv, v_caller, v_conv, v_type, v_status
    from call_sessions where id = p_call_id;
  if v_status is distinct from 'ringing' then return; end if;
  if auth.uid() not in (v_recv, v_caller) then return; end if;
  update call_sessions set status = 'missed', ended_at = now() where id = p_call_id;
  insert into notifications (user_id, actor_id, type, target_type, target_id, body)
    values (v_recv, v_caller, 'missed_call', 'conversation', v_conv, 'Missed ' || v_type || ' call');
end; $$;

-- ─── Triggers ───────────────────────────────────────────────────────────────

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists trg_saved_posts_count on public.saved_posts;
create trigger trg_saved_posts_count after insert or delete on public.saved_posts
  for each row execute function public.bump_post_save_count();

drop trigger if exists trg_saved_shots_count on public.saved_shots;
create trigger trg_saved_shots_count after insert or delete on public.saved_shots
  for each row execute function public.bump_shot_save_count();

drop trigger if exists trg_messages_share_count on public.messages;
create trigger trg_messages_share_count after insert on public.messages
  for each row execute function public.bump_share_count();

-- ─── Realtime ───────────────────────────────────────────────────────────────
-- Add to the supabase_realtime publication (ignore if already present):
--   messages, message_reactions, notifications, call_sessions

-- ─── Storage buckets ────────────────────────────────────────────────────────
-- Public read; size + mime limits enforced. Create via dashboard or:
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',     'avatars',     true,  5242880,  array['image/jpeg','image/png','image/webp']),
  ('post-images', 'post-images', true, 10485760,  array['image/jpeg','image/png','image/webp']),
  ('shot-media',  'shot-media',  true, 52428800,  array['video/mp4','video/webm','video/quicktime']),
  ('show-media',  'show-media',  true, 26214400,  array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
-- Storage RLS: authenticated users may upload to a path prefixed with their uid;
-- public read is enabled by the bucket `public = true` flag.
