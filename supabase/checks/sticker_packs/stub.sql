-- A stand-in for the parts of the live schema 0220, 0223 and 0224 touch:
-- just enough tables and helpers, with auth.uid() read from a setting so
-- each check can act as a different person. DROPS public, auth, storage.

drop schema if exists public cascade; drop schema if exists auth cascade; drop schema if exists storage cascade;
create schema public; create schema auth; create schema storage;
do $$ begin create role anon; exception when others then null; end $$;
do $$ begin create role authenticated; exception when others then null; end $$;
grant usage on schema public, auth, storage to anon, authenticated;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
create table public.profiles (id uuid primary key references auth.users(id), username text, display_name text, avatar_url text, avatar_hue int);
grant select on public.profiles to anon, authenticated;
create table public.conversations (id uuid primary key, last_message_at timestamptz, last_message_id uuid, updated_at timestamptz);
create table public.conversation_members (conversation_id uuid, user_id uuid, primary key (conversation_id, user_id));
create table public.blocked_users (blocker_id uuid, blocked_id uuid);
create table public.notifications (user_id uuid, actor_id uuid, type text, target_type text, target_id uuid, body text);
create table public.messages (id uuid primary key default gen_random_uuid(), conversation_id uuid, sender_id uuid, body text, kind text not null default 'text', reply_to_id uuid, metadata jsonb not null default '{}', is_unsent boolean not null default false, removed_at timestamptz, created_at timestamptz default now());
alter table public.messages enable row level security;
grant select, update on public.messages to authenticated;
create table public.reports (id uuid primary key default gen_random_uuid(), reporter_id uuid, target_type text, target_id uuid, reason text, details text, status text default 'open', created_at timestamptz default now(), unique (reporter_id, target_type, target_id));
alter table public.reports add constraint reports_target_type_check check (target_type in ('post','comment','message','profile','shot','show','conversation'));
create function public.is_conv_member(conv uuid) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.conversation_members where conversation_id = conv and user_id = auth.uid()); $$;
create policy msgs_read on public.messages for select using (public.is_conv_member(conversation_id));
create policy msgs_unsend on public.messages for update using (sender_id = auth.uid());
-- people: a and b share a conversation; c shares another with a; b and d share a third that a is not in
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c'),('00000000-0000-0000-0000-00000000000d');
insert into public.profiles select id, 'u'||right(id::text,1), 'User '||right(id::text,1), null, 1 from auth.users;
insert into public.conversations values ('11111111-1111-1111-1111-111111111111', null, null, null), ('22222222-2222-2222-2222-222222222222', null, null, null), ('33333333-3333-3333-3333-333333333333', null, null, null);
insert into public.conversation_members values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a'),('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b'),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000a'),('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000c'),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000b'),('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000d');
create table public.rate_events (user_id uuid, action text, created_at timestamptz default now());
create function public.rate_limit(p_action text, p_limit int, p_window interval) returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid()); v_count int;
begin
  if v_uid is null then return; end if;
  select count(*) into v_count from public.rate_events where user_id = v_uid and action = p_action and created_at > now() - p_window;
  if v_count >= p_limit then raise exception 'Rate limit exceeded for %, please slow down.', p_action using errcode = 'check_violation'; end if;
  insert into public.rate_events (user_id, action) values (v_uid, p_action);
end $$;
