-- Hypefy — current schema snapshot.
-- Source of truth: supabase/migrations/ (this mirrors 0001_baseline.sql,
-- the consolidated live migration history). Regenerate TS types with the
-- Supabase CLI / MCP after schema changes.

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260602050451_create_profiles
-- ───────────────────────────────────────────────────────────────────
-- Profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  bio text,
  avatar_url text,
  avatar_hue int,
  banner_id text,
  banner_url text,
  current_vibe text,
  interests text[] not null default '{}',
  profile_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- RLS
alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill existing auth users
insert into public.profiles (id)
select u.id from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260602061839_posts_shots_saved_follows_tags
-- ───────────────────────────────────────────────────────────────────
-- ── posts ─────────────────────────────────────────────────────
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  caption text,
  body text,
  image_url text,
  hashtags text[] not null default '{}',
  mentions text[] not null default '{}',
  hype_count int not null default 0,
  comment_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts enable row level security;

create policy "posts: anyone can read"
  on public.posts for select using (true);

create policy "posts: own insert"
  on public.posts for insert
  with check (auth.uid() = user_id);

create policy "posts: own update"
  on public.posts for update
  using (auth.uid() = user_id);

create policy "posts: own delete"
  on public.posts for delete
  using (auth.uid() = user_id);

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- ── shots ─────────────────────────────────────────────────────
create table if not exists public.shots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_url text not null,
  caption text,
  hype_count int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

alter table public.shots enable row level security;

create policy "shots: anyone can read active"
  on public.shots for select
  using (expires_at > now());

create policy "shots: own insert"
  on public.shots for insert
  with check (auth.uid() = user_id);

create policy "shots: own delete"
  on public.shots for delete
  using (auth.uid() = user_id);

-- ── saved_posts ───────────────────────────────────────────────
create table if not exists public.saved_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

alter table public.saved_posts enable row level security;

create policy "saved_posts: own select"
  on public.saved_posts for select
  using (auth.uid() = user_id);

create policy "saved_posts: own insert"
  on public.saved_posts for insert
  with check (auth.uid() = user_id);

create policy "saved_posts: own delete"
  on public.saved_posts for delete
  using (auth.uid() = user_id);

-- ── follows ───────────────────────────────────────────────────
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id),
  constraint no_self_follow check (follower_id != following_id)
);

alter table public.follows enable row level security;

create policy "follows: anyone can read"
  on public.follows for select using (true);

create policy "follows: own insert"
  on public.follows for insert
  with check (auth.uid() = follower_id);

create policy "follows: own delete"
  on public.follows for delete
  using (auth.uid() = follower_id);

-- ── profiles: add profile_tags ────────────────────────────────
alter table public.profiles
  add column if not exists profile_tags text[] not null default '{}';

-- ── Supabase Storage buckets ──────────────────────────────────
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('shot-media', 'shot-media', true)
on conflict (id) do nothing;

create policy "post-images: public read" on storage.objects
  for select using (bucket_id = 'post-images');

create policy "post-images: auth upload" on storage.objects
  for insert with check (bucket_id = 'post-images' and auth.uid() is not null);

create policy "post-images: own delete" on storage.objects
  for delete using (bucket_id = 'post-images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "shot-media: public read" on storage.objects
  for select using (bucket_id = 'shot-media');

create policy "shot-media: auth upload" on storage.objects
  for insert with check (bucket_id = 'shot-media' and auth.uid() is not null);

create policy "shot-media: own delete" on storage.objects
  for delete using (bucket_id = 'shot-media' and auth.uid()::text = (storage.foldername(name))[1]);;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260602105228_shots_in_showcase
-- ───────────────────────────────────────────────────────────────────
-- Add showcase column to shots (persists on profile like Instagram Highlights)
alter table public.shots
  add column if not exists in_showcase boolean not null default false;

-- Index for fast profile showcase fetches
create index if not exists shots_showcase_idx on public.shots (user_id, in_showcase)
  where in_showcase = true;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260602113329_hypes_comments_notifications_rpc
-- ───────────────────────────────────────────────────────────────────
-- ── hypes ────────────────────────────────────────────────────
create table if not exists public.hypes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  target_type  text not null check (target_type in ('post','shot','comment')),
  target_id    uuid not null,
  created_at   timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);
alter table public.hypes enable row level security;
create policy "hypes: anyone can read"   on public.hypes for select using (true);
create policy "hypes: own insert"        on public.hypes for insert with check (auth.uid() = user_id);
create policy "hypes: own delete"        on public.hypes for delete using (auth.uid() = user_id);

-- ── comments ─────────────────────────────────────────────────
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null,
  hype_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.comments enable row level security;
create policy "comments: anyone can read non-deleted" on public.comments for select using (deleted_at is null);
create policy "comments: own insert"  on public.comments for insert with check (auth.uid() = user_id);
create policy "comments: own update"  on public.comments for update using (auth.uid() = user_id);
create policy "comments: own delete"  on public.comments for delete using (auth.uid() = user_id);

-- ── notifications ─────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  type        text not null,  -- hype_post | hype_shot | comment_post | follow | mention_post
  target_type text,
  target_id   uuid,
  body        text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.notifications enable row level security;
create policy "notifications: own select" on public.notifications for select using (auth.uid() = user_id);
create policy "notifications: own update" on public.notifications for update using (auth.uid() = user_id);
-- allow any authenticated user to insert (actor creates notification for owner)
create policy "notifications: auth insert" on public.notifications for insert with check (auth.uid() is not null);

-- ── toggle_hype RPC ───────────────────────────────────────────
create or replace function public.toggle_hype(
  p_target_type text,
  p_target_id   uuid,
  p_owner_id    uuid default null  -- post/shot owner for notification
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_exists  uuid;
  v_hyped   boolean;
  v_count   int := 0;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select id into v_exists
  from public.hypes
  where user_id = v_user and target_type = p_target_type and target_id = p_target_id;

  if v_exists is not null then
    -- un-hype
    delete from public.hypes where id = v_exists;
    v_hyped := false;
  else
    -- hype
    insert into public.hypes (user_id, target_type, target_id) values (v_user, p_target_type, p_target_id);
    v_hyped := true;

    -- create notification (never self-notify)
    if p_owner_id is not null and p_owner_id <> v_user then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (p_owner_id, v_user,
              case p_target_type when 'post' then 'hype_post' else 'hype_shot' end,
              p_target_type, p_target_id, 'hyped your post')
      on conflict do nothing;
    end if;
  end if;

  -- accurate count from source of truth
  select count(*) into v_count
  from public.hypes
  where target_type = p_target_type and target_id = p_target_id;

  -- keep denormalised count up to date
  if p_target_type = 'post' then
    update public.posts set hype_count = v_count where id = p_target_id;
  elsif p_target_type = 'shot' then
    update public.shots set hype_count = v_count where id = p_target_id;
  end if;

  return json_build_object('hyped', v_hyped, 'hype_count', v_count);
end;
$$;

-- ── create_comment RPC ────────────────────────────────────────
create or replace function public.create_comment(
  p_post_id  uuid,
  p_body     text,
  p_owner_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  insert into public.comments (post_id, user_id, body)
  values (p_post_id, v_user, trim(p_body))
  returning id into v_id;

  -- update comment count
  update public.posts
  set comment_count = (select count(*) from public.comments where post_id = p_post_id and deleted_at is null)
  where id = p_post_id;

  -- notify post owner
  if p_owner_id is not null and p_owner_id <> v_user then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (p_owner_id, v_user, 'comment_post', 'post', p_post_id, 'commented on your post')
    on conflict do nothing;
  end if;

  return v_id;
end;
$$;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260602115624_fix_fk_to_profiles_for_postgrest_joins
-- ───────────────────────────────────────────────────────────────────
-- PostgREST can only auto-join on FKs in the public schema.
-- The existing FKs point to auth.users (auth schema) which PostgREST ignores.
-- Add public.profiles FKs so .select("*, profiles(...)") works correctly.

-- posts
alter table public.posts
  drop constraint if exists posts_user_id_fkey,
  add constraint posts_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;

-- shots
alter table public.shots
  drop constraint if exists shots_user_id_fkey,
  add constraint shots_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;

-- comments
alter table public.comments
  drop constraint if exists comments_user_id_fkey,
  add constraint comments_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;

-- saved_posts
alter table public.saved_posts
  drop constraint if exists saved_posts_user_id_fkey,
  add constraint saved_posts_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;

-- follows
alter table public.follows
  drop constraint if exists follows_follower_id_fkey,
  drop constraint if exists follows_following_id_fkey,
  add constraint follows_follower_id_fkey
    foreign key (follower_id) references public.profiles(id) on delete cascade,
  add constraint follows_following_id_fkey
    foreign key (following_id) references public.profiles(id) on delete cascade;

-- hypes
alter table public.hypes
  drop constraint if exists hypes_user_id_fkey,
  add constraint hypes_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;

-- notifications
alter table public.notifications
  drop constraint if exists notifications_user_id_fkey,
  drop constraint if exists notifications_actor_id_fkey,
  add constraint notifications_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade,
  add constraint notifications_actor_id_fkey
    foreign key (actor_id) references public.profiles(id) on delete set null;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260602121414_posts_multi_image_comments_parent
-- ───────────────────────────────────────────────────────────────────
-- Multiple images per post
alter table public.posts
  add column if not exists image_urls text[] not null default '{}';

-- Comment replies (parent_id for threading)
alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260602145445_create_comment_with_parent
-- ───────────────────────────────────────────────────────────────────
create or replace function public.create_comment(
  p_post_id   uuid,
  p_body      text,
  p_owner_id  uuid default null,
  p_parent_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  insert into public.comments (post_id, user_id, body, parent_id)
  values (p_post_id, v_user, trim(p_body), p_parent_id)
  returning id into v_id;

  -- only count top-level comments toward the post total
  if p_parent_id is null then
    update public.posts
    set comment_count = (
      select count(*) from public.comments
      where post_id = p_post_id and deleted_at is null and parent_id is null
    )
    where id = p_post_id;
  end if;

  -- notify post owner only for top-level comments
  if p_parent_id is null and p_owner_id is not null and p_owner_id <> v_user then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (p_owner_id, v_user, 'comment_post', 'post', p_post_id, 'commented on your post')
    on conflict do nothing;
  end if;

  return v_id;
end;
$$;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260603055328_messages_dm_system
-- ───────────────────────────────────────────────────────────────────
-- ── conversations ────────────────────────────────────────────
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

-- ── membership helper (SECURITY DEFINER avoids RLS recursion) ──
create or replace function public.is_conv_member(conv uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv and user_id = auth.uid()
  );
$$;

-- ── RLS ───────────────────────────────────────────────────────
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy "conv: members read" on public.conversations
  for select using (public.is_conv_member(id));

create policy "conv_members: members read" on public.conversation_members
  for select using (public.is_conv_member(conversation_id));

create policy "messages: members read" on public.messages
  for select using (public.is_conv_member(conversation_id));

create policy "messages: members insert" on public.messages
  for insert with check (sender_id = auth.uid() and public.is_conv_member(conversation_id));

-- ── bump last_message_at on new message ───────────────────────
create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = now() where id = new.conversation_id;
  return new;
end; $$;

drop trigger if exists messages_touch_conv on public.messages;
create trigger messages_touch_conv after insert on public.messages
  for each row execute function public.touch_conversation();

-- ── get or create a 1:1 DM ────────────────────────────────────
create or replace function public.get_or_create_dm(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_conv uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if v_me = p_other then raise exception 'Cannot DM yourself'; end if;

  -- existing 1:1 conversation with exactly these two members
  select cm1.conversation_id into v_conv
  from public.conversation_members cm1
  join public.conversation_members cm2
    on cm1.conversation_id = cm2.conversation_id
  where cm1.user_id = v_me and cm2.user_id = p_other
    and (select count(*) from public.conversation_members cm
         where cm.conversation_id = cm1.conversation_id) = 2
  limit 1;

  if v_conv is not null then return v_conv; end if;

  insert into public.conversations default values returning id into v_conv;
  insert into public.conversation_members (conversation_id, user_id)
    values (v_conv, v_me), (v_conv, p_other);
  return v_conv;
end; $$;

-- ── enable realtime on messages ───────────────────────────────
alter publication supabase_realtime add table public.messages;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260603065351_messaging_full_system_extend
-- ───────────────────────────────────────────────────────────────────
-- ── extend conversations ──────────────────────────────────────
alter table public.conversations
  add column if not exists type text not null default 'dm',
  add column if not exists title text,
  add column if not exists avatar_url text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists last_message_id uuid;

-- ── extend conversation_members ───────────────────────────────
alter table public.conversation_members
  add column if not exists role text not null default 'member',
  add column if not exists last_read_at timestamptz,
  add column if not exists muted_until timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists blocked_at timestamptz;

-- members can update their OWN membership flags (read state, mute, archive)
drop policy if exists "conv_members: update own" on public.conversation_members;
create policy "conv_members: update own" on public.conversation_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── extend messages ───────────────────────────────────────────
alter table public.messages alter column body drop not null;
alter table public.messages
  add column if not exists kind text not null default 'text',
  add column if not exists post_id uuid references public.posts(id) on delete set null,
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists is_unsent boolean not null default false,
  add column if not exists unsent_at timestamptz,
  add column if not exists edited_at timestamptz;

-- sender can update own message (unsend / edit)
drop policy if exists "messages: sender update" on public.messages;
create policy "messages: sender update" on public.messages
  for update using (sender_id = auth.uid()) with check (sender_id = auth.uid());

-- ── message_reports ───────────────────────────────────────────
create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reason text,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);
alter table public.message_reports enable row level security;
create policy "message_reports: own read" on public.message_reports
  for select using (reporter_id = auth.uid());
create policy "message_reports: own insert" on public.message_reports
  for insert with check (reporter_id = auth.uid() and public.is_conv_member(conversation_id));

-- ── generic reports (post / comment / profile / shot) ─────────
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','message','profile','shot')),
  target_id uuid not null,
  reason text,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
alter table public.reports enable row level security;
create policy "reports: own read" on public.reports
  for select using (reporter_id = auth.uid());
create policy "reports: own insert" on public.reports
  for insert with check (reporter_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- RPCs
-- ══════════════════════════════════════════════════════════════

-- send_message: insert + bump conversation + notify (new convo / post share)
create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text default null,
  p_kind text default 'text',
  p_post_id uuid default null,
  p_reply_to_id uuid default null
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_msg public.messages%rowtype;
  v_prev_count int;
  v_other uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.is_conv_member(p_conversation_id) then raise exception 'Not a member'; end if;
  if (p_body is null or btrim(p_body) = '') and p_post_id is null then
    raise exception 'Empty message';
  end if;

  select count(*) into v_prev_count from public.messages where conversation_id = p_conversation_id;

  insert into public.messages (conversation_id, sender_id, body, kind, post_id, reply_to_id)
  values (p_conversation_id, v_me, nullif(btrim(p_body), ''), p_kind, p_post_id, p_reply_to_id)
  returning * into v_msg;

  update public.conversations
    set last_message_at = now(), last_message_id = v_msg.id, updated_at = now()
    where id = p_conversation_id;

  -- the other member
  select user_id into v_other from public.conversation_members
    where conversation_id = p_conversation_id and user_id <> v_me limit 1;

  -- notify only on a brand-new conversation or a shared post
  if v_other is not null and (v_prev_count = 0 or p_kind = 'post') then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (
      v_other, v_me,
      case when p_kind = 'post' then 'dm_post_shared' else 'new_message' end,
      'conversation', p_conversation_id,
      case when p_kind = 'post' then 'shared a post with you' else 'sent you a message' end
    );
  end if;

  return json_build_object(
    'id', v_msg.id, 'conversation_id', v_msg.conversation_id, 'sender_id', v_msg.sender_id,
    'body', v_msg.body, 'kind', v_msg.kind, 'post_id', v_msg.post_id,
    'reply_to_id', v_msg.reply_to_id, 'is_unsent', v_msg.is_unsent, 'created_at', v_msg.created_at
  );
end; $$;

-- unsend_message
create or replace function public.unsend_message(p_message_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  update public.messages
    set is_unsent = true, body = null, metadata = '{}'::jsonb, unsent_at = now()
    where id = p_message_id and sender_id = v_me;
  if not found then raise exception 'Cannot unsend'; end if;
end; $$;

-- edit_message
create or replace function public.edit_message(p_message_id uuid, p_body text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  update public.messages
    set body = btrim(p_body), edited_at = now()
    where id = p_message_id and sender_id = v_me and is_unsent = false
      and btrim(p_body) <> '';
  if not found then raise exception 'Cannot edit'; end if;
end; $$;

-- mark_conversation_read
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then return; end if;
  update public.conversation_members
    set last_read_at = now()
    where conversation_id = p_conversation_id and user_id = v_me;
end; $$;

-- report_message
create or replace function public.report_message(p_message_id uuid, p_reason text, p_details text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_me uuid := auth.uid(); v_conv uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  select conversation_id into v_conv from public.messages where id = p_message_id;
  if v_conv is null or not public.is_conv_member(v_conv) then raise exception 'Cannot report'; end if;
  insert into public.message_reports (message_id, reporter_id, conversation_id, reason, details)
  values (p_message_id, v_me, v_conv, p_reason, p_details)
  on conflict (message_id, reporter_id) do nothing;
end; $$;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260603141604_create_avatars_bucket
-- ───────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public read
create policy "avatars_public_read"
on storage.objects for select
using (bucket_id = 'avatars');

-- Authenticated users can upload to their own folder (uid as first path segment)
create policy "avatars_user_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars_user_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars_user_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260603164921_create_shows_table
-- ───────────────────────────────────────────────────────────────────
create table if not exists public.shows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_url text not null,
  caption text,
  hype_count int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

alter table public.shows enable row level security;

create index if not exists shows_user_created_idx on public.shows (user_id, created_at desc);
create index if not exists shows_expires_idx on public.shows (expires_at);

create policy "shows: anyone can read" on public.shows for select using (true);
create policy "shows: own insert" on public.shows for insert to authenticated with check (auth.uid() = user_id);
create policy "shows: own update" on public.shows for update to authenticated using (auth.uid() = user_id);
create policy "shows: own delete" on public.shows for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.shows to authenticated;
grant select on public.shows to anon;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260603164933_repurpose_shots_as_reels
-- ───────────────────────────────────────────────────────────────────
-- Clear leftover junk (expired story-style rows) so shots starts clean as reels
delete from public.shots;

-- Reels are permanent: replace the expires-based read policy
drop policy if exists "shots: anyone can read active" on public.shots;
create policy "shots: anyone can read" on public.shots for select using (true);

-- Drop ephemeral column, add optional video poster/thumbnail
alter table public.shots drop column if exists expires_at;
alter table public.shots add column if not exists poster_url text;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260603164939_toggle_hype_support_show
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_hype(p_target_type text, p_target_id uuid, p_owner_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user    uuid := auth.uid();
  v_exists  uuid;
  v_hyped   boolean;
  v_count   int := 0;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select id into v_exists
  from public.hypes
  where user_id = v_user and target_type = p_target_type and target_id = p_target_id;

  if v_exists is not null then
    delete from public.hypes where id = v_exists;
    v_hyped := false;
  else
    insert into public.hypes (user_id, target_type, target_id) values (v_user, p_target_type, p_target_id);
    v_hyped := true;

    if p_owner_id is not null and p_owner_id <> v_user then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (p_owner_id, v_user,
              case p_target_type when 'post' then 'hype_post' else 'hype_shot' end,
              p_target_type, p_target_id, 'hyped your post')
      on conflict do nothing;
    end if;
  end if;

  select count(*) into v_count
  from public.hypes
  where target_type = p_target_type and target_id = p_target_id;

  if p_target_type = 'post' then
    update public.posts set hype_count = v_count where id = p_target_id;
  elsif p_target_type = 'shot' then
    update public.shots set hype_count = v_count where id = p_target_id;
  elsif p_target_type = 'show' then
    update public.shows set hype_count = v_count where id = p_target_id;
  end if;

  return json_build_object('hyped', v_hyped, 'hype_count', v_count);
end;
$function$;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260603164950_create_show_media_bucket
-- ───────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('show-media', 'show-media', true)
on conflict (id) do nothing;

create policy "show_media_public_read"
on storage.objects for select
using (bucket_id = 'show-media');

create policy "show_media_user_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'show-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "show_media_user_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'show-media' and (storage.foldername(name))[1] = auth.uid()::text);;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260603165643_allow_show_hype_target
-- ───────────────────────────────────────────────────────────────────
alter table public.hypes drop constraint if exists hypes_target_type_check;
alter table public.hypes add constraint hypes_target_type_check
  check (target_type = any (array['post','shot','show','comment']));;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260603173735_comments_support_shots
-- ───────────────────────────────────────────────────────────────────
-- Allow comments to target a shot instead of a post
alter table public.comments alter column post_id drop not null;
alter table public.comments add column if not exists shot_id uuid references public.shots(id) on delete cascade;
alter table public.comments drop constraint if exists comments_target_xor;
alter table public.comments add constraint comments_target_xor check (
  (post_id is not null and shot_id is null) or (post_id is null and shot_id is not null)
);
create index if not exists comments_shot_idx on public.comments (shot_id) where shot_id is not null;

-- Denormalised comment count on shots
alter table public.shots add column if not exists comment_count int not null default 0;

create or replace function public.create_shot_comment(
  p_shot_id uuid, p_body text, p_owner_id uuid default null, p_parent_id uuid default null
) returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  insert into public.comments (shot_id, user_id, body, parent_id)
  values (p_shot_id, v_user, trim(p_body), p_parent_id)
  returning id into v_id;

  if p_parent_id is null then
    update public.shots set comment_count = (
      select count(*) from public.comments
      where shot_id = p_shot_id and deleted_at is null and parent_id is null
    ) where id = p_shot_id;
  end if;

  if p_parent_id is null and p_owner_id is not null and p_owner_id <> v_user then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (p_owner_id, v_user, 'comment_post', 'shot', p_shot_id, 'commented on your Shot')
    on conflict do nothing;
  end if;

  return v_id;
end;
$function$;

grant execute on function public.create_shot_comment(uuid,text,uuid,uuid) to authenticated;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260603173756_create_saved_shots
-- ───────────────────────────────────────────────────────────────────
create table if not exists public.saved_shots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  shot_id uuid not null references public.shots(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, shot_id)
);
alter table public.saved_shots enable row level security;

create policy "saved_shots own select" on public.saved_shots for select to authenticated using (auth.uid() = user_id);
create policy "saved_shots own insert" on public.saved_shots for insert to authenticated with check (auth.uid() = user_id);
create policy "saved_shots own delete" on public.saved_shots for delete to authenticated using (auth.uid() = user_id);

grant select, insert, delete on public.saved_shots to authenticated;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260603175553_comment_count_includes_replies
-- ───────────────────────────────────────────────────────────────────
-- Posts: count ALL non-deleted comments (incl replies), recomputed on every insert
create or replace function public.create_comment(
  p_post_id uuid, p_body text, p_owner_id uuid default null, p_parent_id uuid default null
) returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  insert into public.comments (post_id, user_id, body, parent_id)
  values (p_post_id, v_user, trim(p_body), p_parent_id)
  returning id into v_id;

  update public.posts set comment_count = (
    select count(*) from public.comments where post_id = p_post_id and deleted_at is null
  ) where id = p_post_id;

  if p_parent_id is null and p_owner_id is not null and p_owner_id <> v_user then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (p_owner_id, v_user, 'comment_post', 'post', p_post_id, 'commented on your post')
    on conflict do nothing;
  end if;

  return v_id;
end;
$function$;

-- Shots: same — count all non-deleted comments (incl replies)
create or replace function public.create_shot_comment(
  p_shot_id uuid, p_body text, p_owner_id uuid default null, p_parent_id uuid default null
) returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  insert into public.comments (shot_id, user_id, body, parent_id)
  values (p_shot_id, v_user, trim(p_body), p_parent_id)
  returning id into v_id;

  update public.shots set comment_count = (
    select count(*) from public.comments where shot_id = p_shot_id and deleted_at is null
  ) where id = p_shot_id;

  if p_parent_id is null and p_owner_id is not null and p_owner_id <> v_user then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (p_owner_id, v_user, 'comment_post', 'shot', p_shot_id, 'commented on your Shot')
    on conflict do nothing;
  end if;

  return v_id;
end;
$function$;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260604174405_create_group_rpc
-- ───────────────────────────────────────────────────────────────────
create or replace function public.create_group(p_title text, p_member_ids uuid[])
 returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
  v_conv uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if coalesce(array_length(p_member_ids, 1), 0) < 1 then
    raise exception 'Add at least one member';
  end if;

  insert into public.conversations (type, title, created_by)
  values ('group', nullif(btrim(p_title), ''), v_me)
  returning id into v_conv;

  -- creator is admin
  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conv, v_me, 'admin');

  -- add selected members (deduped, never the creator)
  insert into public.conversation_members (conversation_id, user_id, role)
  select distinct v_conv, x, 'member'
  from unnest(p_member_ids) as x
  where x <> v_me
  on conflict (conversation_id, user_id) do nothing;

  return v_conv;
end;
$function$;

grant execute on function public.create_group(text, uuid[]) to authenticated;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260605041634_message_reactions
-- ───────────────────────────────────────────────────────────────────
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_reactions enable row level security;

create policy "reactions: read for conv members"
on public.message_reactions for select to authenticated
using (
  exists (select 1 from public.messages m where m.id = message_id and public.is_conv_member(m.conversation_id))
);

grant select on public.message_reactions to authenticated;

create or replace function public.toggle_reaction(p_message_id uuid, p_emoji text)
 returns void
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
  v_conv uuid;
  v_existing text;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  select conversation_id into v_conv from public.messages where id = p_message_id;
  if v_conv is null or not public.is_conv_member(v_conv) then raise exception 'Not allowed'; end if;

  select emoji into v_existing from public.message_reactions where message_id = p_message_id and user_id = v_me;
  if v_existing is not null and v_existing = p_emoji then
    delete from public.message_reactions where message_id = p_message_id and user_id = v_me;
  else
    insert into public.message_reactions (message_id, user_id, emoji)
    values (p_message_id, v_me, p_emoji)
    on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  end if;
end;
$function$;

grant execute on function public.toggle_reaction(uuid, text) to authenticated;

alter publication supabase_realtime add table public.message_reactions;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260605050553_messages_shot_share
-- ───────────────────────────────────────────────────────────────────
alter table public.messages add column if not exists shot_id uuid references public.shots(id) on delete set null;

drop function if exists public.send_message(uuid, text, text, uuid, uuid);

create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text default null,
  p_kind text default 'text',
  p_post_id uuid default null,
  p_reply_to_id uuid default null,
  p_shot_id uuid default null
) returns json
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
  v_msg public.messages%rowtype;
  v_prev_count int;
  v_other uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.is_conv_member(p_conversation_id) then raise exception 'Not a member'; end if;
  if (p_body is null or btrim(p_body) = '') and p_post_id is null and p_shot_id is null then
    raise exception 'Empty message';
  end if;

  select count(*) into v_prev_count from public.messages where conversation_id = p_conversation_id;

  insert into public.messages (conversation_id, sender_id, body, kind, post_id, shot_id, reply_to_id)
  values (p_conversation_id, v_me, nullif(btrim(p_body), ''), p_kind, p_post_id, p_shot_id, p_reply_to_id)
  returning * into v_msg;

  update public.conversations
    set last_message_at = now(), last_message_id = v_msg.id, updated_at = now()
    where id = p_conversation_id;

  select user_id into v_other from public.conversation_members
    where conversation_id = p_conversation_id and user_id <> v_me limit 1;

  if v_other is not null and (v_prev_count = 0 or p_kind in ('post', 'shot')) then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (
      v_other, v_me,
      case when p_kind = 'post' then 'dm_post_shared' when p_kind = 'shot' then 'dm_post_shared' else 'new_message' end,
      'conversation', p_conversation_id,
      case when p_kind = 'post' then 'shared a post with you'
           when p_kind = 'shot' then 'shared a Shot with you'
           else 'sent you a message' end
    );
  end if;

  return json_build_object(
    'id', v_msg.id, 'conversation_id', v_msg.conversation_id, 'sender_id', v_msg.sender_id,
    'body', v_msg.body, 'kind', v_msg.kind, 'post_id', v_msg.post_id, 'shot_id', v_msg.shot_id,
    'reply_to_id', v_msg.reply_to_id, 'is_unsent', v_msg.is_unsent, 'created_at', v_msg.created_at
  );
end;
$function$;

grant execute on function public.send_message(uuid, text, text, uuid, uuid, uuid) to authenticated;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260605124203_reports_rls_and_dedup
-- ───────────────────────────────────────────────────────────────────
-- Prevent duplicate reports of the same target by the same user
create unique index if not exists reports_unique_reporter_target
  on public.reports (reporter_id, target_type, target_id);

-- Allow authenticated users to file their own reports
drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

-- Allow a user to see the reports they filed (so the UI can reflect state)
drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own" on public.reports
  for select to authenticated
  using (reporter_id = auth.uid());;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260605133150_storage_bucket_limits
-- ───────────────────────────────────────────────────────────────────
update storage.buckets
  set file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg','image/png','image/webp']
  where id = 'post-images';

update storage.buckets
  set file_size_limit = 52428800,
      allowed_mime_types = array['video/mp4','video/webm','video/quicktime']
  where id = 'shot-media';

update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp']
  where id = 'avatars';

update storage.buckets
  set file_size_limit = 26214400,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/webm']
  where id = 'show-media';;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260605133906_add_save_share_counts
-- ───────────────────────────────────────────────────────────────────
-- 1. Columns
alter table public.posts add column if not exists save_count  int not null default 0;
alter table public.posts add column if not exists share_count int not null default 0;
alter table public.shots add column if not exists save_count  int not null default 0;
alter table public.shots add column if not exists share_count int not null default 0;

-- 2. Backfill saves
update public.posts p
  set save_count = coalesce((select count(*) from public.saved_posts s where s.post_id = p.id), 0);
update public.shots sh
  set save_count = coalesce((select count(*) from public.saved_shots s where s.shot_id = sh.id), 0);

-- 3. Backfill shares (a post/shot shared into any conversation)
update public.posts p
  set share_count = coalesce((select count(*) from public.messages m where m.kind='post' and m.post_id = p.id), 0);
update public.shots sh
  set share_count = coalesce((select count(*) from public.messages m where m.kind='shot' and m.shot_id = sh.id), 0);

-- 4. Save-count maintenance
create or replace function public.bump_post_save_count() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set save_count = save_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set save_count = greatest(save_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end; $$;
drop trigger if exists trg_saved_posts_count on public.saved_posts;
create trigger trg_saved_posts_count
  after insert or delete on public.saved_posts
  for each row execute function public.bump_post_save_count();

create or replace function public.bump_shot_save_count() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.shots set save_count = save_count + 1 where id = new.shot_id;
  elsif tg_op = 'DELETE' then
    update public.shots set save_count = greatest(save_count - 1, 0) where id = old.shot_id;
  end if;
  return null;
end; $$;
drop trigger if exists trg_saved_shots_count on public.saved_shots;
create trigger trg_saved_shots_count
  after insert or delete on public.saved_shots
  for each row execute function public.bump_shot_save_count();

-- 5. Share-count maintenance (post/shot shared into a conversation)
create or replace function public.bump_share_count() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'post' and new.post_id is not null then
    update public.posts set share_count = share_count + 1 where id = new.post_id;
  elsif new.kind = 'shot' and new.shot_id is not null then
    update public.shots set share_count = share_count + 1 where id = new.shot_id;
  end if;
  return null;
end; $$;
drop trigger if exists trg_messages_share_count on public.messages;
create trigger trg_messages_share_count
  after insert on public.messages
  for each row execute function public.bump_share_count();;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260605135604_call_sessions
-- ───────────────────────────────────────────────────────────────────
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

create index if not exists call_sessions_receiver_idx on public.call_sessions (receiver_id, status);
create index if not exists call_sessions_caller_idx on public.call_sessions (caller_id, status);

alter table public.call_sessions enable row level security;

drop policy if exists "calls_select_party" on public.call_sessions;
create policy "calls_select_party" on public.call_sessions
  for select to authenticated
  using (caller_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists "calls_insert_caller" on public.call_sessions;
create policy "calls_insert_caller" on public.call_sessions
  for insert to authenticated
  with check (caller_id = auth.uid());

drop policy if exists "calls_update_party" on public.call_sessions;
create policy "calls_update_party" on public.call_sessions
  for update to authenticated
  using (caller_id = auth.uid() or receiver_id = auth.uid());

-- Realtime so the receiver rings app-wide
alter publication supabase_realtime add table public.call_sessions;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260605135628_call_rpcs
-- ───────────────────────────────────────────────────────────────────
-- start_call: create a ringing session + notify receiver
create or replace function public.start_call(p_conversation_id uuid, p_receiver_id uuid, p_type text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_caller uuid := auth.uid();
begin
  if v_caller is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from conversation_members where conversation_id = p_conversation_id and user_id = v_caller) then
    raise exception 'not a member';
  end if;
  if not exists (select 1 from conversation_members where conversation_id = p_conversation_id and user_id = p_receiver_id) then
    raise exception 'receiver not a member';
  end if;

  insert into call_sessions (conversation_id, caller_id, receiver_id, type, status)
  values (p_conversation_id, v_caller, p_receiver_id, p_type, 'ringing')
  returning id into v_id;

  insert into notifications (user_id, actor_id, type, target_type, target_id, body)
  values (p_receiver_id, v_caller, 'incoming_call', 'conversation', p_conversation_id,
          'is calling you' );

  return v_id;
end; $$;

-- accept_call: receiver answers
create or replace function public.accept_call(p_call_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  update call_sessions set status = 'accepted', answered_at = now()
  where id = p_call_id and receiver_id = auth.uid() and status = 'ringing';
end; $$;

-- decline_call: receiver rejects
create or replace function public.decline_call(p_call_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  update call_sessions set status = 'declined', ended_at = now()
  where id = p_call_id and receiver_id = auth.uid() and status = 'ringing';
end; $$;

-- quick_reply_call: receiver declines with a canned message into the chat
create or replace function public.quick_reply_call(p_call_id uuid, p_reply text)
  returns void language plpgsql security definer set search_path = public as $$
declare v_conv uuid; v_me uuid := auth.uid();
begin
  select conversation_id into v_conv from call_sessions
    where id = p_call_id and receiver_id = v_me and status = 'ringing';
  if v_conv is null then return; end if;

  insert into messages (conversation_id, sender_id, body, kind)
  values (v_conv, v_me, p_reply, 'text');

  update call_sessions set status = 'declined', quick_reply = p_reply, ended_at = now()
  where id = p_call_id;
end; $$;

-- end_call: either party hangs up
create or replace function public.end_call(p_call_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  update call_sessions set status = 'ended', ended_at = now()
  where id = p_call_id and (caller_id = auth.uid() or receiver_id = auth.uid())
    and status in ('ringing','accepted');
end; $$;

-- mark_call_missed: caller (or timeout) marks an unanswered call missed + notifies
create or replace function public.mark_call_missed(p_call_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare v_recv uuid; v_caller uuid; v_conv uuid; v_type text; v_status text;
begin
  select receiver_id, caller_id, conversation_id, type, status
    into v_recv, v_caller, v_conv, v_type, v_status
    from call_sessions where id = p_call_id;
  if v_status is distinct from 'ringing' then return; end if;
  if auth.uid() not in (v_recv, v_caller) then return; end if;

  update call_sessions set status = 'missed', ended_at = now() where id = p_call_id;

  insert into notifications (user_id, actor_id, type, target_type, target_id, body)
  values (v_recv, v_caller, 'missed_call', 'conversation', v_conv,
          'Missed ' || v_type || ' call');
end; $$;

grant execute on function public.start_call(uuid, uuid, text) to authenticated;
grant execute on function public.accept_call(uuid) to authenticated;
grant execute on function public.decline_call(uuid) to authenticated;
grant execute on function public.quick_reply_call(uuid, text) to authenticated;
grant execute on function public.end_call(uuid) to authenticated;
grant execute on function public.mark_call_missed(uuid) to authenticated;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260605141139_perf_indexes_and_notif_read
-- ───────────────────────────────────────────────────────────────────
-- Posts / shots feeds
create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists posts_user_id_idx on public.posts(user_id);
create index if not exists shots_created_at_idx on public.shots(created_at desc);
create index if not exists shots_user_id_idx on public.shots(user_id);

-- Notifications
create index if not exists notifications_user_read_idx on public.notifications(user_id, is_read, created_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);

-- Conversations / messages
create index if not exists conversations_last_message_idx on public.conversations(last_message_at desc);
create index if not exists conversation_members_user_idx on public.conversation_members(user_id);
create index if not exists conversation_members_conversation_user_idx on public.conversation_members(conversation_id, user_id);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at desc);
create index if not exists messages_sender_idx on public.messages(sender_id);

-- Engagement
create index if not exists hypes_target_idx on public.hypes(target_type, target_id);
create index if not exists hypes_user_target_idx on public.hypes(user_id, target_type, target_id);
create index if not exists saved_posts_user_idx on public.saved_posts(user_id);
create index if not exists saved_shots_user_idx on public.saved_shots(user_id);
create index if not exists follows_follower_idx on public.follows(follower_id);
create index if not exists follows_following_idx on public.follows(following_id);
create index if not exists comments_post_idx on public.comments(post_id, created_at);
create index if not exists comments_shot_idx on public.comments(shot_id, created_at);

-- Mark all my notifications read in one shot
create or replace function public.mark_notifications_read()
  returns void language plpgsql security definer set search_path = public as $$
begin
  update public.notifications set is_read = true
  where user_id = auth.uid() and is_read = false;
end; $$;
grant execute on function public.mark_notifications_read() to authenticated;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260605153246_realtime_notifications
-- ───────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260605154701_message_requests_and_blocking
-- ───────────────────────────────────────────────────────────────────
-- Blocked users
create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid references public.profiles(id) on delete cascade,
  blocked_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocked_users enable row level security;
drop policy if exists blocked_users_own on public.blocked_users;
create policy blocked_users_own on public.blocked_users
  for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create index if not exists blocked_users_blocker_idx on public.blocked_users(blocker_id);
create index if not exists blocked_users_blocked_idx on public.blocked_users(blocked_id);

-- Per-member request acceptance (false = the conversation is a pending request for this member)
alter table public.conversation_members add column if not exists request_accepted boolean default true;

-- get_or_create_dm: block-aware + flags the receiver's side as a request when
-- the receiver does not follow the sender.
create or replace function public.get_or_create_dm(p_other uuid)
  returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_me uuid := auth.uid(); v_conv uuid; v_accepted boolean;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if v_me = p_other then raise exception 'Cannot DM yourself'; end if;

  -- Either party blocking the other prevents a DM.
  if exists (select 1 from public.blocked_users
             where (blocker_id = p_other and blocked_id = v_me)
                or (blocker_id = v_me and blocked_id = p_other)) then
    raise exception 'blocked';
  end if;

  select cm1.conversation_id into v_conv
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm1.conversation_id = cm2.conversation_id
  where cm1.user_id = v_me and cm2.user_id = p_other
    and (select count(*) from public.conversation_members cm where cm.conversation_id = cm1.conversation_id) = 2
  limit 1;
  if v_conv is not null then return v_conv; end if;

  insert into public.conversations default values returning id into v_conv;

  -- Receiver accepts automatically only if they already follow the sender.
  v_accepted := exists (select 1 from public.follows where follower_id = p_other and following_id = v_me);

  insert into public.conversation_members (conversation_id, user_id, request_accepted)
    values (v_conv, v_me, true), (v_conv, p_other, v_accepted);
  return v_conv;
end; $$;

-- Approve a pending request (receiver opts in).
create or replace function public.approve_message_request(p_conversation_id uuid)
  returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  update public.conversation_members set request_accepted = true
    where conversation_id = p_conversation_id and user_id = v_me;
end; $$;

-- Block the other member of a DM (and globally block that user).
create or replace function public.block_message_request(p_conversation_id uuid)
  returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_me uuid := auth.uid(); v_other uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  select user_id into v_other from public.conversation_members
    where conversation_id = p_conversation_id and user_id <> v_me limit 1;
  if v_other is null then return; end if;
  insert into public.blocked_users (blocker_id, blocked_id)
    values (v_me, v_other) on conflict do nothing;
  update public.conversation_members set blocked_at = now()
    where conversation_id = p_conversation_id and user_id = v_me;
end; $$;

create or replace function public.block_user(p_blocked uuid)
  returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null or v_me = p_blocked then return; end if;
  insert into public.blocked_users (blocker_id, blocked_id)
    values (v_me, p_blocked) on conflict do nothing;
end; $$;

grant execute on function public.approve_message_request(uuid) to authenticated;
grant execute on function public.block_message_request(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260605154728_block_guards_send_and_call
-- ───────────────────────────────────────────────────────────────────
-- send_message: reject if any other member has blocked the sender.
create or replace function public.send_message(p_conversation_id uuid, p_body text default null, p_kind text default 'text', p_post_id uuid default null, p_reply_to_id uuid default null, p_shot_id uuid default null)
  returns json language plpgsql security definer set search_path to 'public'
as $$
declare v_me uuid := auth.uid(); v_msg public.messages%rowtype; v_prev_count int; v_other uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.is_conv_member(p_conversation_id) then raise exception 'Not a member'; end if;
  if (p_body is null or btrim(p_body) = '') and p_post_id is null and p_shot_id is null then raise exception 'Empty message'; end if;

  -- Block guard: a member who blocked me cannot receive my messages.
  if exists (
    select 1 from public.conversation_members cm
    join public.blocked_users b on b.blocker_id = cm.user_id and b.blocked_id = v_me
    where cm.conversation_id = p_conversation_id and cm.user_id <> v_me
  ) then
    raise exception 'blocked';
  end if;

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

-- start_call: reject if either party blocked the other.
create or replace function public.start_call(p_conversation_id uuid, p_receiver_id uuid, p_type text)
  returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_id uuid; v_caller uuid := auth.uid();
begin
  if v_caller is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from conversation_members where conversation_id = p_conversation_id and user_id = v_caller) then raise exception 'not a member'; end if;
  if not exists (select 1 from conversation_members where conversation_id = p_conversation_id and user_id = p_receiver_id) then raise exception 'receiver not a member'; end if;
  if exists (select 1 from public.blocked_users
             where (blocker_id = p_receiver_id and blocked_id = v_caller)
                or (blocker_id = v_caller and blocked_id = p_receiver_id)) then
    raise exception 'blocked';
  end if;
  insert into call_sessions (conversation_id, caller_id, receiver_id, type, status)
    values (p_conversation_id, v_caller, p_receiver_id, p_type, 'ringing') returning id into v_id;
  insert into notifications (user_id, actor_id, type, target_type, target_id, body)
    values (p_receiver_id, v_caller, 'incoming_call', 'conversation', p_conversation_id, 'is calling you');
  return v_id;
end; $$;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260606051027_call_sessions_replica_identity_full
-- ───────────────────────────────────────────────────────────────────
-- Realtime must see the full old row to evaluate RLS on UPDATE/DELETE events.
-- Without this, 'accepted'/'declined'/'ended' UPDATEs are dropped and the caller
-- never syncs off "Ringing".
alter table public.call_sessions replica identity full;

-- Same reason: the notifications badge subscribes to UPDATE (mark-read) and the
-- RLS policy references user_id (non-PK), so deliver those reliably too.
alter table public.notifications replica identity full;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260606063707_banners_bucket
-- ───────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banners', 'banners', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "banners_public_read" on storage.objects;
create policy "banners_public_read" on storage.objects
  for select to public using (bucket_id = 'banners');

drop policy if exists "banners_user_insert" on storage.objects;
create policy "banners_user_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "banners_user_update" on storage.objects;
create policy "banners_user_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "banners_user_delete" on storage.objects;
create policy "banners_user_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260606130854_add_shows_linked_post_and_showcase
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE shows ADD COLUMN IF NOT EXISTS linked_post_id uuid REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS is_showcase boolean DEFAULT false;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260606135142_shows_rls_linked_post_showcase
-- ───────────────────────────────────────────────────────────────────

-- Ensure RLS is enabled on shows (already should be, but safe to re-confirm)
ALTER TABLE shows ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies for shows to cover linked_post_id + is_showcase

-- 1. Anyone can read shows (public feed + showcase on profiles)
DROP POLICY IF EXISTS "shows_select_public" ON shows;
CREATE POLICY "shows_select_public" ON shows
  FOR SELECT USING (true);

-- 2. Authenticated users can insert their own shows (including linked_post_id)
DROP POLICY IF EXISTS "shows_insert_own" ON shows;
CREATE POLICY "shows_insert_own" ON shows
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. Users can update only their own shows (is_showcase toggle, caption edits)
DROP POLICY IF EXISTS "shows_update_own" ON shows;
CREATE POLICY "shows_update_own" ON shows
  FOR UPDATE USING (auth.uid() = user_id);

-- 4. Users can delete only their own shows
DROP POLICY IF EXISTS "shows_delete_own" ON shows;
CREATE POLICY "shows_delete_own" ON shows
  FOR DELETE USING (auth.uid() = user_id);
;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260609125534_create_chat_media_bucket
-- ───────────────────────────────────────────────────────────────────

-- Create the chat-media storage bucket for photo/video attachments in messages
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  true,
  52428800, -- 50 MB
  array['image/jpeg','image/jpg','image/png','image/gif','image/webp','image/heic','video/mp4','video/webm','video/quicktime','video/mov']
)
on conflict (id) do nothing;

-- RLS: any authenticated user can upload to their own folder (userId/filename)
create policy "chat_media_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS: anyone can read (bucket is public, but belt-and-suspenders)
create policy "chat_media_select"
  on storage.objects for select
  to public
  using (bucket_id = 'chat-media');

-- RLS: owner can delete their own files
create policy "chat_media_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260610085412_create_reposts_and_mute
-- ───────────────────────────────────────────────────────────────────
-- Reposts table
create table if not exists public.reposts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

alter table public.reposts enable row level security;

create policy "reposts_select_all" on public.reposts for select using (true);
create policy "reposts_insert_own" on public.reposts for insert with check (auth.uid() = user_id);
create policy "reposts_delete_own" on public.reposts for delete using (auth.uid() = user_id);

-- Repost count on posts
alter table public.posts add column if not exists repost_count int not null default 0;

-- Trigger: bump count + notify post owner
create or replace function public.handle_repost_insert()
returns trigger language plpgsql security definer as $$
declare
  v_owner uuid;
begin
  update public.posts set repost_count = repost_count + 1 where id = new.post_id
    returning user_id into v_owner;
  if v_owner is not null and v_owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, post_id)
    values (v_owner, new.user_id, 'repost', new.post_id);
  end if;
  return new;
end $$;

create or replace function public.handle_repost_delete()
returns trigger language plpgsql security definer as $$
begin
  update public.posts set repost_count = greatest(repost_count - 1, 0) where id = old.post_id;
  return old;
end $$;

drop trigger if exists on_repost_insert on public.reposts;
create trigger on_repost_insert after insert on public.reposts
  for each row execute function public.handle_repost_insert();

drop trigger if exists on_repost_delete on public.reposts;
create trigger on_repost_delete after delete on public.reposts
  for each row execute function public.handle_repost_delete();

-- Mute support on conversation members
alter table public.conversation_members add column if not exists muted_at timestamptz;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260610085441_fix_repost_notification_columns
-- ───────────────────────────────────────────────────────────────────
create or replace function public.handle_repost_insert()
returns trigger language plpgsql security definer as $$
declare
  v_owner uuid;
begin
  update public.posts set repost_count = repost_count + 1 where id = new.post_id
    returning user_id into v_owner;
  if v_owner is not null and v_owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id)
    values (v_owner, new.user_id, 'repost', 'post', new.post_id);
  end if;
  return new;
end $$;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260610085612_repoint_reposts_user_fk_to_profiles
-- ───────────────────────────────────────────────────────────────────
alter table public.reposts drop constraint if exists reposts_user_id_fkey;
alter table public.reposts
  add constraint reposts_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260610090101_create_show_views
-- ───────────────────────────────────────────────────────────────────
create table if not exists public.show_views (
  show_id uuid not null references public.shows(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (show_id, viewer_id)
);

alter table public.show_views enable row level security;

-- Insert your own views
create policy "show_views_insert_own" on public.show_views
  for insert with check (auth.uid() = viewer_id);

-- See your own views, or all views on shows you own
create policy "show_views_select" on public.show_views
  for select using (
    auth.uid() = viewer_id
    or auth.uid() = (select user_id from public.shows s where s.id = show_id)
  );;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260610090451_message_edit_and_leave_conversation
-- ───────────────────────────────────────────────────────────────────
-- Message editing
alter table public.messages add column if not exists edited_at timestamptz;

create or replace function public.edit_message(p_message_id uuid, p_body text)
returns void language plpgsql security definer as $$
begin
  update public.messages
     set body = p_body,
         edited_at = now()
   where id = p_message_id
     and sender_id = auth.uid()
     and kind = 'text'
     and coalesce(is_unsent, false) = false;
end $$;

grant execute on function public.edit_message(uuid, text) to authenticated;

-- Leave a conversation (group: remove membership; DM: same — thread disappears for you)
create or replace function public.leave_conversation(p_conversation_id uuid)
returns void language plpgsql security definer as $$
begin
  delete from public.conversation_members
   where conversation_id = p_conversation_id
     and user_id = auth.uid();
end $$;

grant execute on function public.leave_conversation(uuid) to authenticated;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260610091340_comment_hype_and_mention_notifications
-- ───────────────────────────────────────────────────────────────────
-- 1. toggle_hype: notify comment owners too (UI passes p_owner_id null for comments),
--    and keep comments.hype_count in sync
create or replace function public.toggle_hype(p_target_type text, p_target_id uuid, p_owner_id uuid default null::uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user    uuid := auth.uid();
  v_exists  uuid;
  v_hyped   boolean;
  v_count   int := 0;
  v_owner   uuid := p_owner_id;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  -- Resolve the owner for comments server-side
  if p_target_type = 'comment' and v_owner is null then
    select user_id into v_owner from public.comments where id = p_target_id;
  end if;

  select id into v_exists
  from public.hypes
  where user_id = v_user and target_type = p_target_type and target_id = p_target_id;

  if v_exists is not null then
    delete from public.hypes where id = v_exists;
    v_hyped := false;
  else
    insert into public.hypes (user_id, target_type, target_id) values (v_user, p_target_type, p_target_id);
    v_hyped := true;

    if v_owner is not null and v_owner <> v_user then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (v_owner, v_user,
              case p_target_type
                when 'post' then 'hype_post'
                when 'comment' then 'hype_comment'
                else 'hype_shot' end,
              p_target_type, p_target_id,
              case p_target_type when 'comment' then 'hyped your comment' else 'hyped your post' end)
      on conflict do nothing;
    end if;
  end if;

  select count(*) into v_count
  from public.hypes
  where target_type = p_target_type and target_id = p_target_id;

  if p_target_type = 'post' then
    update public.posts set hype_count = v_count where id = p_target_id;
  elsif p_target_type = 'shot' then
    update public.shots set hype_count = v_count where id = p_target_id;
  elsif p_target_type = 'show' then
    update public.shows set hype_count = v_count where id = p_target_id;
  elsif p_target_type = 'comment' then
    update public.comments set hype_count = v_count where id = p_target_id;
  end if;

  return json_build_object('hyped', v_hyped, 'hype_count', v_count);
end;
$function$;

-- 2. Mention notifications: trigger on post insert resolves @usernames
create or replace function public.handle_post_mentions()
returns trigger language plpgsql security definer as $$
declare
  v_mention text;
  v_target uuid;
begin
  if new.mentions is null then return new; end if;
  foreach v_mention in array new.mentions loop
    select id into v_target from public.profiles
      where lower(username) = lower(v_mention) and id <> new.user_id;
    if v_target is not null then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (v_target, new.user_id, 'mention_post', 'post', new.id, 'mentioned you in a post')
      on conflict do nothing;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists on_post_mentions on public.posts;
create trigger on_post_mentions after insert on public.posts
  for each row execute function public.handle_post_mentions();;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260610091453_notifications_actor_delete_follow
-- ───────────────────────────────────────────────────────────────────
-- Allow the actor to retract their own follow notification on unfollow
create policy "notifications: actor delete follow" on public.notifications
  for delete using (auth.uid() = actor_id and type = 'follow');;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260610091651_privacy_and_notif_prefs
-- ───────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists is_private boolean not null default false;
alter table public.profiles add column if not exists dm_privacy text not null default 'everyone'
  check (dm_privacy in ('everyone', 'following'));
alter table public.profiles add column if not exists notif_prefs jsonb not null default '{}'::jsonb;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260610091927_notif_prefs_enforcement
-- ───────────────────────────────────────────────────────────────────
-- Drop notification inserts the recipient has opted out of.
-- Prefs default ON; an explicit false in profiles.notif_prefs disables that type.
create or replace function public.filter_notification_prefs()
returns trigger language plpgsql security definer as $$
declare
  v_prefs jsonb;
  v_key text;
begin
  v_key := case
    when new.type like 'hype_%' or new.type = 'repost' then 'hypes'
    when new.type like 'comment_%' then 'comments'
    when new.type = 'follow' then 'follows'
    when new.type like 'mention_%' then 'mentions'
    when new.type like 'message%' then 'messages'
    else null
  end;
  if v_key is null then return new; end if;

  select notif_prefs into v_prefs from public.profiles where id = new.user_id;
  if v_prefs is not null and v_prefs ->> v_key = 'false' then
    return null; -- recipient opted out of this type
  end if;
  return new;
end $$;

drop trigger if exists notif_prefs_filter on public.notifications;
create trigger notif_prefs_filter before insert on public.notifications
  for each row execute function public.filter_notification_prefs();;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260610091959_dm_privacy_enforcement
-- ───────────────────────────────────────────────────────────────────
create or replace function public.get_or_create_dm(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
  v_conv uuid;
  v_accepted boolean;
  v_dm_privacy text;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if v_me = p_other then raise exception 'Cannot DM yourself'; end if;

  -- Either party blocking the other prevents a DM.
  if exists (select 1 from public.blocked_users
             where (blocker_id = p_other and blocked_id = v_me)
                or (blocker_id = v_me and blocked_id = p_other)) then
    raise exception 'blocked';
  end if;

  select cm1.conversation_id into v_conv
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm1.conversation_id = cm2.conversation_id
  where cm1.user_id = v_me and cm2.user_id = p_other
    and (select count(*) from public.conversation_members cm where cm.conversation_id = cm1.conversation_id) = 2
  limit 1;
  if v_conv is not null then return v_conv; end if;

  -- dm_privacy = 'following': only people the receiver follows may start a chat
  select dm_privacy into v_dm_privacy from public.profiles where id = p_other;
  if v_dm_privacy = 'following'
     and not exists (select 1 from public.follows where follower_id = p_other and following_id = v_me) then
    raise exception 'dm_restricted';
  end if;

  insert into public.conversations default values returning id into v_conv;

  -- Receiver accepts automatically only if they already follow the sender.
  v_accepted := exists (select 1 from public.follows where follower_id = p_other and following_id = v_me);

  insert into public.conversation_members (conversation_id, user_id, request_accepted)
    values (v_conv, v_me, true), (v_conv, p_other, v_accepted);
  return v_conv;
end; $function$;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260610172605_create_push_subscriptions
-- ───────────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subs_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_subs_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_subs_update_own" on public.push_subscriptions
  for update using (auth.uid() = user_id);
create policy "push_subs_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260610172651_push_webhook_trigger
-- ───────────────────────────────────────────────────────────────────
create extension if not exists pg_net with schema extensions;

-- Fire-and-forget POST to the app's push endpoint on every new notification.
create or replace function public.notify_push_webhook()
returns trigger language plpgsql security definer as $$
begin
  perform net.http_post(
    url := 'https://hypefy.chat/api/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', '4a97d69d822af9835e07c3cff3497fb74252ca293f064297'
    ),
    body := jsonb_build_object(
      'id', new.id,
      'user_id', new.user_id,
      'actor_id', new.actor_id,
      'type', new.type,
      'target_type', new.target_type,
      'target_id', new.target_id,
      'body', new.body
    )
  );
  return new;
end $$;

drop trigger if exists on_notification_push on public.notifications;
create trigger on_notification_push after insert on public.notifications
  for each row execute function public.notify_push_webhook();;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260612134848_harden_functions_and_fix_webhook_url
-- ───────────────────────────────────────────────────────────────────
-- Pin search_path on all flagged functions (prevents search-path hijacking)
alter function public.set_updated_at() set search_path = public;
alter function public.handle_repost_insert() set search_path = public;
alter function public.handle_repost_delete() set search_path = public;
alter function public.edit_message(uuid, text) set search_path = public;
alter function public.leave_conversation(uuid) set search_path = public;
alter function public.handle_post_mentions() set search_path = public;
alter function public.filter_notification_prefs() set search_path = public;

-- Push webhook: hypefy.chat 307-redirects to www — pg_net does not follow
-- redirects, so post directly to the canonical host.
create or replace function public.notify_push_webhook()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://www.hypefy.chat/api/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', '4a97d69d822af9835e07c3cff3497fb74252ca293f064297'
    ),
    body := jsonb_build_object(
      'id', new.id,
      'user_id', new.user_id,
      'actor_id', new.actor_id,
      'type', new.type,
      'target_type', new.target_type,
      'target_id', new.target_id,
      'body', new.body
    )
  );
  return new;
end $$;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260612135050_add_missing_fk_indexes
-- ───────────────────────────────────────────────────────────────────
create index if not exists call_sessions_conversation_idx on public.call_sessions(conversation_id);
create index if not exists comments_parent_idx on public.comments(parent_id) where parent_id is not null;
create index if not exists comments_user_idx on public.comments(user_id);
create index if not exists conversations_created_by_idx on public.conversations(created_by);
create index if not exists message_reactions_user_idx on public.message_reactions(user_id);
create index if not exists message_reports_conversation_idx on public.message_reports(conversation_id);
create index if not exists message_reports_reporter_idx on public.message_reports(reporter_id);
create index if not exists messages_post_idx on public.messages(post_id) where post_id is not null;
create index if not exists messages_reply_to_idx on public.messages(reply_to_id) where reply_to_id is not null;
create index if not exists messages_shot_idx on public.messages(shot_id) where shot_id is not null;
create index if not exists notifications_actor_idx on public.notifications(actor_id);
create index if not exists reposts_post_idx on public.reposts(post_id);
create index if not exists saved_posts_post_idx on public.saved_posts(post_id);
create index if not exists saved_shots_shot_idx on public.saved_shots(shot_id);
create index if not exists show_views_viewer_idx on public.show_views(viewer_id);
create index if not exists shows_linked_post_idx on public.shows(linked_post_id) where linked_post_id is not null;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260626171540_perf_rls_initplan_wrap_auth
-- ───────────────────────────────────────────────────────────────────
-- Perf: wrap auth.uid()/auth.role()/auth.jwt() in (select ...) so Postgres
-- evaluates them once per query (initplan) instead of once per row.
alter policy blocked_users_own on public.blocked_users using ((blocker_id = (select auth.uid()))) with check ((blocker_id = (select auth.uid())));
alter policy calls_insert_caller on public.call_sessions with check ((caller_id = (select auth.uid())));
alter policy calls_select_party on public.call_sessions using (((caller_id = (select auth.uid())) OR (receiver_id = (select auth.uid()))));
alter policy calls_update_party on public.call_sessions using (((caller_id = (select auth.uid())) OR (receiver_id = (select auth.uid()))));
alter policy "comments: own delete" on public.comments using (((select auth.uid()) = user_id));
alter policy "comments: own insert" on public.comments with check (((select auth.uid()) = user_id));
alter policy "comments: own update" on public.comments using (((select auth.uid()) = user_id));
alter policy "conv_members: update own" on public.conversation_members using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "follows: own delete" on public.follows using (((select auth.uid()) = follower_id));
alter policy "follows: own insert" on public.follows with check (((select auth.uid()) = follower_id));
alter policy "hypes: own delete" on public.hypes using (((select auth.uid()) = user_id));
alter policy "hypes: own insert" on public.hypes with check (((select auth.uid()) = user_id));
alter policy "message_reports: own insert" on public.message_reports with check (((reporter_id = (select auth.uid())) AND is_conv_member(conversation_id)));
alter policy "message_reports: own read" on public.message_reports using ((reporter_id = (select auth.uid())));
alter policy "messages: members insert" on public.messages with check (((sender_id = (select auth.uid())) AND is_conv_member(conversation_id)));
alter policy "messages: sender update" on public.messages using ((sender_id = (select auth.uid()))) with check ((sender_id = (select auth.uid())));
alter policy "notifications: actor delete follow" on public.notifications using ((((select auth.uid()) = actor_id) AND (type = 'follow'::text)));
alter policy "notifications: auth insert" on public.notifications with check (((select auth.uid()) IS NOT NULL));
alter policy "notifications: own select" on public.notifications using (((select auth.uid()) = user_id));
alter policy "notifications: own update" on public.notifications using (((select auth.uid()) = user_id));
alter policy "posts: own delete" on public.posts using (((select auth.uid()) = user_id));
alter policy "posts: own insert" on public.posts with check (((select auth.uid()) = user_id));
alter policy "posts: own update" on public.posts using (((select auth.uid()) = user_id));
alter policy "Users can insert their own profile" on public.profiles with check (((select auth.uid()) = id));
alter policy "Users can update their own profile" on public.profiles using (((select auth.uid()) = id));
alter policy push_subs_delete_own on public.push_subscriptions using (((select auth.uid()) = user_id));
alter policy push_subs_insert_own on public.push_subscriptions with check (((select auth.uid()) = user_id));
alter policy push_subs_select_own on public.push_subscriptions using (((select auth.uid()) = user_id));
alter policy push_subs_update_own on public.push_subscriptions using (((select auth.uid()) = user_id));
alter policy "reports: own insert" on public.reports with check ((reporter_id = (select auth.uid())));
alter policy "reports: own read" on public.reports using ((reporter_id = (select auth.uid())));
alter policy reports_insert_own on public.reports with check ((reporter_id = (select auth.uid())));
alter policy reports_select_own on public.reports using ((reporter_id = (select auth.uid())));
alter policy reposts_delete_own on public.reposts using (((select auth.uid()) = user_id));
alter policy reposts_insert_own on public.reposts with check (((select auth.uid()) = user_id));
alter policy "saved_posts: own delete" on public.saved_posts using (((select auth.uid()) = user_id));
alter policy "saved_posts: own insert" on public.saved_posts with check (((select auth.uid()) = user_id));
alter policy "saved_posts: own select" on public.saved_posts using (((select auth.uid()) = user_id));
alter policy "saved_shots own delete" on public.saved_shots using (((select auth.uid()) = user_id));
alter policy "saved_shots own insert" on public.saved_shots with check (((select auth.uid()) = user_id));
alter policy "saved_shots own select" on public.saved_shots using (((select auth.uid()) = user_id));
alter policy "shots: own delete" on public.shots using (((select auth.uid()) = user_id));
alter policy "shots: own insert" on public.shots with check (((select auth.uid()) = user_id));
alter policy show_views_insert_own on public.show_views with check (((select auth.uid()) = viewer_id));
alter policy show_views_select on public.show_views using ((((select auth.uid()) = viewer_id) OR ((select auth.uid()) = ( SELECT s.user_id FROM shows s WHERE (s.id = show_views.show_id)))));
alter policy "shows: own delete" on public.shows using (((select auth.uid()) = user_id));
alter policy "shows: own insert" on public.shows with check (((select auth.uid()) = user_id));
alter policy "shows: own update" on public.shows using (((select auth.uid()) = user_id));
alter policy shows_delete_own on public.shows using (((select auth.uid()) = user_id));
alter policy shows_insert_own on public.shows with check (((select auth.uid()) = user_id));
alter policy shows_update_own on public.shows using (((select auth.uid()) = user_id));;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260626171842_consolidate_redundant_policies_and_dup_index
-- ───────────────────────────────────────────────────────────────────
-- Remove redundant duplicate permissive policies (keep the {public} variants,
-- which are a safe superset since auth.uid() is null for anon). Resolves
-- multiple_permissive_policies + duplicate_index advisor warnings.

-- shows: drop the older {authenticated} owner set + the duplicate public-read.
drop policy if exists "shows: own delete" on public.shows;
drop policy if exists "shows: own insert" on public.shows;
drop policy if exists "shows: own update" on public.shows;
drop policy if exists "shows: anyone can read" on public.shows;

-- reports: drop the {authenticated} duplicates (keep the {public} variants).
drop policy if exists reports_insert_own on public.reports;
drop policy if exists reports_select_own on public.reports;

-- reports: drop the duplicate unique index (keep the constraint-backed one).
drop index if exists public.reports_unique_reporter_target;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260626171923_restrict_function_execute_to_authenticated
-- ───────────────────────────────────────────────────────────────────
-- Security: SECURITY DEFINER (and other) functions in public were executable by
-- anon/public. None should run pre-login. Revoke from anon + public and grant
-- only to authenticated (service_role bypasses). Trigger functions are invoked
-- by the table owner, so this does not affect them.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from anon, public;', r.sig);
    execute format('grant execute on function %s to authenticated;', r.sig);
  end loop;
end $$;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260628043347_add_presence_last_seen
-- ───────────────────────────────────────────────────────────────────
-- Presence: last_seen_at heartbeat + per-user activity privacy flag.
alter table public.profiles
  add column if not exists last_seen_at timestamptz,
  add column if not exists show_activity boolean not null default true;

-- Lightweight heartbeat: each client touches its own row. SECURITY DEFINER so
-- it only ever writes the caller's last_seen_at, independent of RLS specifics.
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;

revoke execute on function public.touch_last_seen() from anon;
grant execute on function public.touch_last_seen() to authenticated;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260628044653_group_management_rpcs
-- ───────────────────────────────────────────────────────────────────
-- Group management: admin-gated RPCs. All SECURITY DEFINER so they enforce
-- the admin check themselves regardless of table RLS.

create or replace function public.update_conversation(p_conversation_id uuid, p_title text default null, p_avatar_url text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from conversation_members where conversation_id = p_conversation_id and user_id = auth.uid() and role = 'admin') then
    raise exception 'Only admins can edit this group';
  end if;
  update conversations
     set title = coalesce(p_title, title),
         avatar_url = coalesce(p_avatar_url, avatar_url),
         updated_at = now()
   where id = p_conversation_id and type = 'group';
end; $$;

create or replace function public.add_conversation_member(p_conversation_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from conversation_members where conversation_id = p_conversation_id and user_id = auth.uid() and role = 'admin') then
    raise exception 'Only admins can add members';
  end if;
  insert into conversation_members (conversation_id, user_id, role)
  values (p_conversation_id, p_user_id, 'member')
  on conflict do nothing;
end; $$;

create or replace function public.remove_conversation_member(p_conversation_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from conversation_members where conversation_id = p_conversation_id and user_id = auth.uid() and role = 'admin') then
    raise exception 'Only admins can remove members';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Use leave to remove yourself';
  end if;
  delete from conversation_members where conversation_id = p_conversation_id and user_id = p_user_id;
end; $$;

create or replace function public.set_member_role(p_conversation_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_role not in ('admin','member') then raise exception 'Invalid role'; end if;
  if not exists (select 1 from conversation_members where conversation_id = p_conversation_id and user_id = auth.uid() and role = 'admin') then
    raise exception 'Only admins can change roles';
  end if;
  update conversation_members set role = p_role where conversation_id = p_conversation_id and user_id = p_user_id;
end; $$;

revoke execute on function public.update_conversation(uuid, text, text) from anon;
revoke execute on function public.add_conversation_member(uuid, uuid) from anon;
revoke execute on function public.remove_conversation_member(uuid, uuid) from anon;
revoke execute on function public.set_member_role(uuid, uuid, text) from anon;
grant execute on function public.update_conversation(uuid, text, text) to authenticated;
grant execute on function public.add_conversation_member(uuid, uuid) to authenticated;
grant execute on function public.remove_conversation_member(uuid, uuid) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260628050035_verified_badges
-- ───────────────────────────────────────────────────────────────────
-- Verified badge: data-backed is_verified flag.
alter table public.profiles add column if not exists is_verified boolean not null default false;

-- Grant/revoke verification. SECURITY DEFINER but callable only by the
-- service role (execute revoked from anon + authenticated) — verification is
-- an out-of-band admin action, not something any logged-in user can do.
create or replace function public.set_verified(p_user_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set is_verified = p_value where id = p_user_id;
end; $$;

revoke execute on function public.set_verified(uuid, boolean) from anon;
revoke execute on function public.set_verified(uuid, boolean) from authenticated;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260628050538_collections
-- ───────────────────────────────────────────────────────────────────
-- Bookmark collections: organize saved posts into named folders.
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  cover_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (collection_id, post_id)
);

create index if not exists collections_user_idx on public.collections (user_id, created_at desc);
create index if not exists collection_items_coll_idx on public.collection_items (collection_id, created_at desc);

alter table public.collections enable row level security;
alter table public.collection_items enable row level security;

-- Owner-only: a user manages only their own collections and their items.
create policy collections_owner_all on public.collections
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy collection_items_owner_all on public.collection_items
  for all using (
    exists (select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid()))
  );;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260628051145_post_view_count
-- ───────────────────────────────────────────────────────────────────
-- Creator analytics: a view signal on posts.
alter table public.posts add column if not exists view_count integer not null default 0;

-- Increment a post's view count. SECURITY DEFINER; never counts the author's
-- own views so analytics reflect real reach.
create or replace function public.increment_post_view(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.posts set view_count = view_count + 1
   where id = p_post_id and user_id <> auth.uid();
end; $$;

revoke execute on function public.increment_post_view(uuid) from anon;
grant execute on function public.increment_post_view(uuid) to authenticated;;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260628051440_collection_items_post_fk_index
-- ───────────────────────────────────────────────────────────────────
-- Cover the collection_items.post_id FK (e.g. cascade deletes when a post is removed).
create index if not exists collection_items_post_idx on public.collection_items (post_id);;

-- ───────────────────────────────────────────────────────────────────
-- migration: 20260628052448_reports_target_type_align
-- ───────────────────────────────────────────────────────────────────
-- The reports CHECK rejected target types the app actually submits ('user',
-- 'show'), so reporting a user or a Show failed silently. Align the allowed
-- set with the ReportSheet values and add 'conversation' for group reports.
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type = any (array['post','comment','message','profile','shot','user','show','conversation']));;

-- ───────────────────────────────────────────────────────────────────
-- migration: 0002_set_verified_revoke_public (security fix)
-- ───────────────────────────────────────────────────────────────────
-- Security fix (found in two-account QA): set_verified must be service-role
-- only. Postgres grants EXECUTE to PUBLIC by default, so revoking from
-- anon/authenticated alone left a privilege-escalation hole — any logged-in
-- user could verify (or un-verify) anyone. Revoke from PUBLIC and grant
-- explicitly to service_role.
revoke execute on function public.set_verified(uuid, boolean) from public;
revoke execute on function public.set_verified(uuid, boolean) from anon;
revoke execute on function public.set_verified(uuid, boolean) from authenticated;
grant execute on function public.set_verified(uuid, boolean) to service_role;
