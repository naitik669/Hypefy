-- The chat PIN is exactly four digits.
--
-- It was 4 to 6, like the app lock. The keypad on the Vault and on locked
-- chats now takes four and sends them on the fourth, with no Enter key, so a
-- longer PIN could be set here that the pad could never type. This makes the
-- rule the same in both places. The app lock keeps its 4 to 6.
--
-- A chat PIN of five or six digits set before this still verifies (nothing
-- here touches stored hashes), but cannot be entered on the pad. Whoever has
-- one uses "Forgot PIN", proves who they are, and chooses a four digit one;
-- their chats stay locked or hidden as they were.

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
