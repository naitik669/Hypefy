-- Chat lock and the Vault.
--
-- Two levels of keeping a chat out of sight, both behind the chat PIN that
-- 0031 built and nothing used:
--
--   locked   out of the Messages list, behind a "Locked chats" row
--   hidden   locked, and with no visible entry at all (the Vault)
--
-- A deterrent against someone holding your unlocked phone. NOT encryption:
-- messages are stored exactly as before.
--
-- Unlocking is a fact the SERVER holds, not a flag in the browser. The inbox
-- and thread pages are rendered on the server; if they sent locked rows and
-- the page merely hid them, every name and preview would sit in the payload
-- for anyone who looked. So a PIN is checked here, an unlock is recorded
-- here with an expiry, and the pages ask this database whether to render.

alter table public.conversation_members
  add column if not exists hidden_at timestamptz;

-- Hidden is a kind of locked, never an alternative to it.
alter table public.conversation_members
  drop constraint if exists conversation_members_hidden_is_locked;
alter table public.conversation_members
  add constraint conversation_members_hidden_is_locked
  check (hidden_at is null or locked_at is not null);

create table if not exists public.vault_unlocks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
-- RLS on with no policies, and no table grants: reachable only through the
-- functions below (the same technique as app_locks).
alter table public.vault_unlocks enable row level security;
revoke all on table public.vault_unlocks from anon, authenticated;

/** How long an unlock lasts if the app never says "lock" (it does, on leaving
    Messages and on going to the background; this is the backstop). */
create or replace function public.vault_unlocked()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vault_unlocks
     where user_id = (select auth.uid()) and expires_at > now()
  );
$$;

-- The PIN is checked by verify_lock_pin, so its rate limit (10 per 15
-- minutes, counted before the comparison) is the Vault's rate limit too.
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
  return true;
end $$;

-- Still in a locked chat: keep it open. Extends an unlock, never creates one.
create or replace function public.touch_vault()
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update public.vault_unlocks set expires_at = now() + interval '15 minutes'
   where user_id = (select auth.uid()) and expires_at > now();
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

create or replace function public.lock_vault()
returns void
language sql security definer set search_path = public as $$
  delete from public.vault_unlocks where user_id = (select auth.uid());
$$;

-- Signed in, with a password, a code or a provider, in the last few minutes.
-- This is what the app's "prove it's you" step produces, read from the token
-- itself so it cannot be claimed by a caller.
create or replace function public.recently_authenticated(p_seconds int default 300)
returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1
      from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e
     where e ->> 'method' in ('password', 'totp', 'oauth', 'otp')
       and (e ->> 'timestamp') ~ '^[0-9]+$'
       and (e ->> 'timestamp')::bigint > extract(epoch from now()) - p_seconds
  );
$$;

-- set_lock_pin replaced any PIN for anyone holding the session. For the app
-- lock that person is already inside the app. For the chat PIN it meant an
-- unlocked phone was enough to set a new PIN and walk into the Vault. A chat
-- PIN that already exists can now only be replaced from inside an unlocked
-- Vault, or straight after proving who you are (which is "Forgot PIN").
create or replace function public.set_lock_pin(p_scope text, p_pin text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_scope not in ('app', 'chat') then raise exception 'Invalid lock scope'; end if;
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

-- Removing the chat PIN while chats are still locked would leave them with
-- no way in: nothing could ever unlock them. Unlock them first.
create or replace function public.clear_lock_pin(p_scope text, p_current_pin text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean;
begin
  v_ok := public.verify_lock_pin(p_scope, p_current_pin);
  if not v_ok then raise exception 'Incorrect PIN'; end if;

  if p_scope = 'chat' and exists (
    select 1 from public.conversation_members
     where user_id = (select auth.uid()) and locked_at is not null
  ) then
    raise exception 'Unlock your chats before removing the PIN';
  end if;

  update public.app_locks set
    app_pin_hash = case when p_scope = 'app' then null else app_pin_hash end,
    app_pin_set_at = case when p_scope = 'app' then null else app_pin_set_at end,
    chat_pin_hash = case when p_scope = 'chat' then null else chat_pin_hash end,
    chat_pin_set_at = case when p_scope = 'chat' then null else chat_pin_set_at end
  where user_id = (select auth.uid());
end $$;

-- conversation_members lets a member update their own row (that is how pin
-- and mute are written), which would also let a client clear locked_at
-- directly and skip the PIN. Level changes go through set_chat_level only.
create or replace function public.guard_chat_level()
returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.locked_at is distinct from old.locked_at or new.hidden_at is distinct from old.hidden_at)
     and coalesce(current_setting('hypefy.chat_level', true), '') <> 'ok'
     and (select auth.uid()) is not null then
    raise exception 'Use set_chat_level to lock, hide or unlock a chat';
  end if;
  return new;
end $$;

drop trigger if exists conversation_members_guard_level on public.conversation_members;
create trigger conversation_members_guard_level
  before update on public.conversation_members
  for each row execute function public.guard_chat_level();

-- The one way a chat changes level. It announces itself to the guard above
-- for the length of its own statement.
--
-- Raising a chat from normal needs only that a PIN exists (a level with no
-- PIN behind it would lock the chat away for good). Any change to a chat that
-- is already locked, in either direction, needs the Vault unlocked: bringing
-- a chat back out is exactly what the PIN protects.
create or replace function public.set_chat_level(p_conversation_id uuid, p_level text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_locked timestamptz;
  v_hidden timestamptz;
  v_rank_now int;
  v_rank_new int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_level not in ('normal', 'locked', 'hidden') then raise exception 'Invalid level'; end if;

  select locked_at, hidden_at into v_locked, v_hidden
    from public.conversation_members
   where conversation_id = p_conversation_id and user_id = v_uid;
  if not found then raise exception 'Not a member of that chat'; end if;

  if p_level <> 'normal' and not coalesce(public.has_lock_pin('chat'), false) then
    raise exception 'Set a PIN first';
  end if;

  v_rank_now := case when v_hidden is not null then 2 when v_locked is not null then 1 else 0 end;
  v_rank_new := case p_level when 'hidden' then 2 when 'locked' then 1 else 0 end;

  if v_rank_new <> v_rank_now and v_rank_now >= 1 and not public.vault_unlocked() then
    raise exception 'Unlock your chats first';
  end if;

  perform set_config('hypefy.chat_level', 'ok', true);
  update public.conversation_members set
    locked_at = case when p_level = 'normal' then null else coalesce(locked_at, now()) end,
    hidden_at = case when p_level = 'hidden' then coalesce(hidden_at, now()) else null end
  where conversation_id = p_conversation_id and user_id = v_uid;
  perform set_config('hypefy.chat_level', '', true);
end $$;

-- What the Messages screen may know while locked: how many, and whether
-- anything in there is unread. No names, no ids.
create or replace function public.vault_overview()
returns table (locked int, hidden int, unread boolean, has_pin boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select cm.conversation_id, cm.locked_at, cm.hidden_at, cm.last_read_at, cm.muted_at
      from public.conversation_members cm
     where cm.user_id = (select auth.uid())
       and cm.locked_at is not null
       and cm.blocked_at is null
  )
  select
    (select count(*)::int from mine where hidden_at is null),
    (select count(*)::int from mine where hidden_at is not null),
    exists (
      select 1 from mine
        join lateral (
          select m.sender_id, m.created_at from public.messages m
           where m.conversation_id = mine.conversation_id
           order by m.created_at desc limit 1
        ) last on true
       where mine.muted_at is null
         and last.sender_id <> (select auth.uid())
         and (mine.last_read_at is null or last.created_at > mine.last_read_at)
    ),
    coalesce(public.has_lock_pin('chat'), false);
$$;

-- The number on the Messages tab is the ordinary inbox only. A count that
-- included a locked chat would point at something the list does not show.
create or replace function public.unread_dm_count()
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.conversation_members cm
  join lateral (
    select m.sender_id, m.created_at
    from public.messages m
    where m.conversation_id = cm.conversation_id
    order by m.created_at desc
    limit 1
  ) last on true
  where cm.user_id = (select auth.uid())
    and cm.blocked_at is null
    and cm.muted_at is null
    and cm.locked_at is null
    and last.sender_id <> cm.user_id
    and (cm.last_read_at is null or last.created_at > cm.last_read_at);
$$;

-- The share sheet does not suggest the people or groups of a locked chat:
-- being offered "send to Maya" is the chat showing through.
create or replace function public.share_suggestions(p_limit integer default 40)
returns table (
  kind text,
  id uuid,
  name text,
  username text,
  avatar_hue integer,
  avatar_url text,
  members integer,
  score numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with me as (select auth.uid() as uid),
  blocked as (
    select b.blocked_id as uid from blocked_users b where b.blocker_id = (select uid from me)
    union
    select b.blocker_id from blocked_users b where b.blocked_id = (select uid from me)
  ),
  locked_people as (
    select other.user_id as uid
      from conversation_members mine
      join conversations c on c.id = mine.conversation_id and c.type <> 'group'
      join conversation_members other on other.conversation_id = c.id and other.user_id <> mine.user_id
     where mine.user_id = (select uid from me) and mine.locked_at is not null
  ),
  candidates as (
    select other.user_id as uid
      from conversation_members mine
      join conversations c on c.id = mine.conversation_id and c.type <> 'group'
      join conversation_members other on other.conversation_id = c.id and other.user_id <> mine.user_id
     where mine.user_id = (select uid from me)
    union
    select friend_id from close_friends where user_id = (select uid from me)
    union
    select following_id from follows where follower_id = (select uid from me)
    union
    select follower_id from follows where following_id = (select uid from me)
  ),
  strength as (
    select rs.user_id as uid, rs.strength
      from relationship_strength((select array_agg(uid) from candidates), 60) rs
  ),
  shared_people as (
    select other.user_id as uid,
           sum(6.0 * greatest(0.3, 1 - extract(epoch from now() - m.created_at) / 86400.0 / 180)) as pts
      from messages m
      join conversations c on c.id = m.conversation_id and c.type <> 'group'
      join conversation_members other on other.conversation_id = c.id and other.user_id <> (select uid from me)
     where m.sender_id = (select uid from me)
       and m.kind in ('post', 'shot')
       and m.created_at > now() - interval '180 days'
     group by other.user_id
  ),
  people as (
    select 'person'::text as kind, p.id, coalesce(p.display_name, p.username) as name, p.username,
           p.avatar_hue, p.avatar_url, null::integer as members,
           round((coalesce(s.strength, 0) + coalesce(sp.pts, 0)
                  + case when cf.friend_id is not null then 2 else 0 end)::numeric, 3) as score
      from candidates cand
      join profiles p on p.id = cand.uid and p.profile_completed
      left join strength s on s.uid = cand.uid
      left join shared_people sp on sp.uid = cand.uid
      left join close_friends cf on cf.user_id = (select uid from me) and cf.friend_id = cand.uid
     where cand.uid <> (select uid from me)
       and cand.uid not in (select uid from blocked)
       and cand.uid not in (select uid from locked_people)
       and (coalesce(s.strength, 0) > 0 or coalesce(sp.pts, 0) > 0 or cf.friend_id is not null)
  ),
  my_groups as (
    select c.id, c.title, c.avatar_url, c.last_message_at
      from conversation_members mine
      join conversations c on c.id = mine.conversation_id and c.type = 'group'
     where mine.user_id = (select uid from me)
       and mine.locked_at is null
       and c.last_message_at > now() - interval '90 days'
  ),
  groups as (
    select 'group'::text as kind, g.id,
           coalesce(nullif(btrim(g.title), ''),
                    (select string_agg(coalesce(pp.display_name, pp.username), ', ' order by pp.display_name)
                       from (select pr.display_name, pr.username
                               from conversation_members cm
                               join profiles pr on pr.id = cm.user_id
                              where cm.conversation_id = g.id and cm.user_id <> (select uid from me)
                              limit 3) pp)) as name,
           null::text as username,
           null::integer as avatar_hue,
           g.avatar_url,
           (select count(*)::int from conversation_members cm where cm.conversation_id = g.id) as members,
           round((5.0 * greatest(0.3, 1 - extract(epoch from now() - g.last_message_at) / 86400.0 / 60)
                  + coalesce((select sum(6.0 * greatest(0.3, 1 - extract(epoch from now() - m.created_at) / 86400.0 / 180))
                                from messages m
                               where m.conversation_id = g.id
                                 and m.sender_id = (select uid from me)
                                 and m.kind in ('post', 'shot')
                                 and m.created_at > now() - interval '180 days'), 0))::numeric, 3) as score
      from my_groups g
  )
  select * from (select * from people union all select * from groups) everything
   order by score desc, name nulls last
   limit greatest(least(p_limit, 100), 0);
$function$;

-- New SECURITY DEFINER functions are executable by PUBLIC unless told otherwise.
revoke all on function public.vault_unlocked() from public, anon;
revoke all on function public.unlock_vault(text) from public, anon;
revoke all on function public.touch_vault() from public, anon;
revoke all on function public.lock_vault() from public, anon;
revoke all on function public.recently_authenticated(int) from public, anon;
revoke all on function public.set_chat_level(uuid, text) from public, anon;
revoke all on function public.vault_overview() from public, anon;
grant execute on function public.vault_unlocked() to authenticated;
grant execute on function public.unlock_vault(text) to authenticated;
grant execute on function public.touch_vault() to authenticated;
grant execute on function public.lock_vault() to authenticated;
grant execute on function public.recently_authenticated(int) to authenticated;
grant execute on function public.set_chat_level(uuid, text) to authenticated;
grant execute on function public.vault_overview() to authenticated;
