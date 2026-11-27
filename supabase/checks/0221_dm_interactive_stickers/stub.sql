-- A stand-in for the parts of the live schema 0174 and 0221 touch: just
-- enough tables and helpers, with auth.uid() read from a setting so each
-- check can act as a different person. DROPS the public and auth schemas.

drop schema if exists public cascade; drop schema if exists auth cascade;
create schema public; create schema auth;
do $$ begin create role anon; exception when others then null; end $$;
do $$ begin create role authenticated; exception when others then null; end $$;
grant usage on schema public, auth to anon, authenticated;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
create table public.profiles (id uuid primary key references auth.users(id), username text, display_name text, avatar_url text, avatar_hue int);
create table public.conversations (id uuid primary key, last_message_at timestamptz, last_message_id uuid, updated_at timestamptz);
create table public.conversation_members (conversation_id uuid, user_id uuid, primary key (conversation_id, user_id));
create table public.blocked_users (blocker_id uuid, blocked_id uuid);
create table public.messages (id uuid primary key default gen_random_uuid(), conversation_id uuid, sender_id uuid, body text, kind text not null default 'text', reply_to_id uuid, metadata jsonb not null default '{}', is_unsent boolean not null default false, removed_at timestamptz, created_at timestamptz default now());
alter table public.messages enable row level security;
grant select on public.messages to authenticated;
create table public.rate_events (user_id uuid, action text, created_at timestamptz default now());
create function public.rate_limit(p_action text, p_limit int, p_window interval) returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid()); v_count int;
begin
  if v_uid is null then return; end if;
  select count(*) into v_count from public.rate_events where user_id = v_uid and action = p_action and created_at > now() - p_window;
  if v_count >= p_limit then raise exception 'Rate limit exceeded for %, please slow down.', p_action using errcode = 'check_violation'; end if;
  insert into public.rate_events (user_id, action) values (v_uid, p_action);
end $$;
create function public.is_conv_member(conv uuid) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.conversation_members where conversation_id = conv and user_id = auth.uid()); $$;
create policy msgs_read on public.messages for select using (public.is_conv_member(conversation_id));
-- people: a=asker, b, c members; d outsider
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c'),('00000000-0000-0000-0000-00000000000d');
insert into public.profiles select id, 'u'||right(id::text,1), 'User '||right(id::text,1), null, 1 from auth.users;
insert into public.conversations values ('11111111-1111-1111-1111-111111111111', null, null, null);
insert into public.conversation_members values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a'),('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b'),('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000c');
