-- A chat PIN chosen before PINs became four digits can still be typed.
--
-- 0117 made new chat PINs exactly four digits and the keypad followed: four
-- places, sent on the fourth. Anyone who had already chosen five or six
-- digits was left with a PIN the pad could not take. Their PIN was never
-- wrong; the pad stopped listening after four.
--
-- The pad needs to know how many digits to wait for, and a hash does not say.
-- So the length is kept beside it:
--
--   * a PIN set from now on records its length (always 4 for chats);
--   * a PIN set before this has none recorded. The pad offers six places and
--     an Enter key for it, as it used to, and the first time it opens the
--     Vault its length is recorded, so from then on the pad knows.
--
-- The length of a PIN is not a secret worth keeping from the person holding
-- the phone: the pad shows it as empty places either way.

alter table public.app_locks add column if not exists chat_pin_len smallint;

-- How many places the pad should show: the recorded length, 4 when there is
-- no PIN yet (that is what will be chosen), and null when there is a PIN of
-- unknown length.
create or replace function public.chat_pin_places()
returns smallint
language sql stable security definer set search_path = public as $$
  select case
    when a.chat_pin_hash is null then 4::smallint
    else a.chat_pin_len
  end
  from (select 1) one
  left join public.app_locks a on a.user_id = (select auth.uid());
$$;

revoke all on function public.chat_pin_places() from public, anon;
grant execute on function public.chat_pin_places() to authenticated;

create or replace function public.unlock_vault(p_pin text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.verify_lock_pin('chat', p_pin) then return false; end if;
  insert into public.vault_unlocks (user_id, expires_at)
  values (v_uid, now() + interval '15 minutes')
  on conflict (user_id) do update set expires_at = excluded.expires_at;
  -- It just opened, so this is how long the PIN is. Written once.
  update public.app_locks set chat_pin_len = length(p_pin)
   where user_id = v_uid and chat_pin_len is null;
  return true;
end $$;

create or replace function public.set_lock_pin(p_scope text, p_pin text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_scope not in ('app', 'chat') then raise exception 'Invalid lock scope'; end if;
  if p_scope = 'chat' and p_pin !~ '^[0-9]{4}$' then raise exception 'PIN must be 4 digits'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN must be 4-6 digits'; end if;

  if p_scope = 'chat'
     and exists (select 1 from public.app_locks where user_id = v_uid and chat_pin_hash is not null)
     and not public.vault_unlocked()
     and not public.recently_authenticated() then
    raise exception 'Unlock your chats, or confirm your password, to change this PIN';
  end if;

  insert into public.app_locks (user_id, app_pin_hash, app_pin_set_at, chat_pin_hash, chat_pin_set_at, chat_pin_len)
  values (
    v_uid,
    case when p_scope = 'app' then crypt(p_pin, gen_salt('bf', 10)) end,
    case when p_scope = 'app' then now() end,
    case when p_scope = 'chat' then crypt(p_pin, gen_salt('bf', 10)) end,
    case when p_scope = 'chat' then now() end,
    case when p_scope = 'chat' then length(p_pin) end
  )
  on conflict (user_id) do update set
    app_pin_hash = case when p_scope = 'app' then excluded.app_pin_hash else public.app_locks.app_pin_hash end,
    app_pin_set_at = case when p_scope = 'app' then excluded.app_pin_set_at else public.app_locks.app_pin_set_at end,
    chat_pin_hash = case when p_scope = 'chat' then excluded.chat_pin_hash else public.app_locks.chat_pin_hash end,
    chat_pin_set_at = case when p_scope = 'chat' then excluded.chat_pin_set_at else public.app_locks.chat_pin_set_at end,
    chat_pin_len = case when p_scope = 'chat' then excluded.chat_pin_len else public.app_locks.chat_pin_len end;
end $$;
