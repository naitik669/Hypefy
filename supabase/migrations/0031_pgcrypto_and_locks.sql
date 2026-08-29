-- App lock + chat lock: a device-access / shoulder-surfing deterrent, NOT
-- encryption. Two independent PIN credentials (app-wide, and a separate one
-- for locked chats) that may hold the same digits but are stored and verified
-- as unrelated secrets. Neither credential is ever readable by the client —
-- only through the three RPCs below, which return booleans/void, never the
-- hash.
--
-- pgcrypto is confirmed already installed on this project (checked via
-- list_extensions: pgcrypto 1.3, schema `extensions`) but was never declared
-- by a migration — it was enabled out-of-band. Declare it anyway, idempotent,
-- so a clean project reproduces this schema. Mirrors the pg_net/pg_cron
-- declarations already in 0001_baseline.sql:2150 and 0017_scheduled_posts.sql:66.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.app_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_pin_hash text,
  app_pin_set_at timestamptz,
  chat_pin_hash text,
  chat_pin_set_at timestamptz,
  app_biometric_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- RLS on with ZERO policies — same technique as rate_events
-- (0026_rate_limiting.sql:14, "only the SECURITY DEFINER limiter touches
-- this table"). Plus an explicit table-level revoke, so PostgREST can't even
-- attempt a query against it: the hash is reachable through no path except
-- the three RPCs below, all of which return only booleans/void.
alter table public.app_locks enable row level security;
revoke all on table public.app_locks from anon, authenticated;

-- Reuses the existing generic public.set_updated_at() (0001_baseline.sql:28,
-- already driving profiles_set_updated_at) rather than a new duplicate.
drop trigger if exists app_locks_set_updated_at on public.app_locks;
create trigger app_locks_set_updated_at before update on public.app_locks
  for each row execute function public.set_updated_at();

-- set_lock_pin: create or replace the PIN for one scope ('app' or 'chat').
-- Upserts the caller's row. 4-6 digit PINs only, matching the native OS
-- lock-screen convention users already know.
create or replace function public.set_lock_pin(p_scope text, p_pin text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_scope not in ('app', 'chat') then raise exception 'Invalid lock scope'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN must be 4-6 digits'; end if;

  insert into public.app_locks (user_id, app_pin_hash, app_pin_set_at, chat_pin_hash, chat_pin_set_at)
  values (
    v_uid,
    case when p_scope = 'app' then crypt(p_pin, gen_salt('bf', 10)) end,
    case when p_scope = 'app' then now() end,
    case when p_scope = 'chat' then crypt(p_pin, gen_salt('bf', 10)) end,
    case when p_scope = 'chat' then now() end
  )
  on conflict (user_id) do update set
    app_pin_hash = case when p_scope = 'app' then excluded.app_pin_hash else public.app_locks.app_pin_hash end,
    app_pin_set_at = case when p_scope = 'app' then excluded.app_pin_set_at else public.app_locks.app_pin_set_at end,
    chat_pin_hash = case when p_scope = 'chat' then excluded.chat_pin_hash else public.app_locks.chat_pin_hash end,
    chat_pin_set_at = case when p_scope = 'chat' then excluded.chat_pin_set_at else public.app_locks.chat_pin_set_at end;
end $$;

-- verify_lock_pin: the only way to check a PIN. Rate-limited BEFORE the
-- comparison so both failed and successful attempts count against the
-- window — a correct-on-the-11th-try grind still gets cut off, it just also
-- costs the attacker their last successful guess.
create or replace function public.verify_lock_pin(p_scope text, p_pin text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := (select auth.uid()); v_hash text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_scope not in ('app', 'chat') then raise exception 'Invalid lock scope'; end if;

  perform public.rate_limit('lock_pin_' || p_scope, 10, interval '15 minutes');

  select case when p_scope = 'app' then app_pin_hash else chat_pin_hash end
    into v_hash from public.app_locks where user_id = v_uid;

  if v_hash is null then return false; end if;
  return v_hash = crypt(p_pin, v_hash);
end $$;

-- clear_lock_pin: disable a lock scope. Requires the current PIN, so a
-- stolen/unlocked session alone can't turn the lock off.
create or replace function public.clear_lock_pin(p_scope text, p_current_pin text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean;
begin
  v_ok := public.verify_lock_pin(p_scope, p_current_pin);
  if not v_ok then raise exception 'Incorrect PIN'; end if;

  update public.app_locks set
    app_pin_hash = case when p_scope = 'app' then null else app_pin_hash end,
    app_pin_set_at = case when p_scope = 'app' then null else app_pin_set_at end,
    chat_pin_hash = case when p_scope = 'chat' then null else chat_pin_hash end,
    chat_pin_set_at = case when p_scope = 'chat' then null else chat_pin_set_at end
  where user_id = (select auth.uid());
end $$;

-- has_lock_pin: lets settings UI show "PIN set" state without ever touching
-- the hash — just whether one exists.
create or replace function public.has_lock_pin(p_scope text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case p_scope
    when 'app' then app_pin_hash is not null
    when 'chat' then chat_pin_hash is not null
    else false
  end
  from public.app_locks where user_id = (select auth.uid());
$$;

-- No migration in this repo closes the door on future functions globally —
-- 0027_lock_down_anon_rpcs.sql was a one-time sweep over what existed then.
-- Every new SECURITY DEFINER function defaults to PUBLIC-executable and must
-- be closed by hand, every time.
revoke all on function public.set_lock_pin(text, text) from public, anon;
grant execute on function public.set_lock_pin(text, text) to authenticated;
revoke all on function public.verify_lock_pin(text, text) from public, anon;
grant execute on function public.verify_lock_pin(text, text) to authenticated;
revoke all on function public.clear_lock_pin(text, text) from public, anon;
grant execute on function public.clear_lock_pin(text, text) to authenticated;
revoke all on function public.has_lock_pin(text) from public, anon;
grant execute on function public.has_lock_pin(text) to authenticated;
