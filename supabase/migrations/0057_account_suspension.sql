-- There was no such thing as a ban.
--
-- blocked_users is strictly per-user — it hides someone from you, not from
-- everyone — and nothing on profiles marked an account as suspended. So a
-- moderator could take a post down (0055) and the same account could post the
-- same thing again a minute later. Takedown without suspension is a treadmill.
--
-- WHY TRIGGERS AND NOT RPC CHECKS
--
-- Roughly 22 SECURITY DEFINER functions perform the writes in this app —
-- send_message, create_comment, follow_user, toggle_hype, set_note, create_group
-- and so on — and a definer function bypasses row-level security entirely. So a
-- suspension enforced in RLS policies alone would be enforced on almost
-- nothing, and enforcing it inside each RPC is an enumeration that grows every
-- time someone adds a function, which is the kind of list you lose.
--
-- A trigger fires on both paths, because auth.uid() reads the JWT claim from a
-- GUC and a definer function does not change it. 0026_rate_limiting.sql already
-- uses exactly this technique (tg_rate_limit_comments and friends), so this is
-- an established pattern here rather than a new one.

alter table public.profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_until timestamptz,   -- null = indefinite
  add column if not exists suspension_reason text,
  add column if not exists suspended_by uuid references public.profiles(id);

-- New columns are not in 0050's writable allowlist, so a user cannot lift their
-- own suspension. Adding them to the preserve trigger as well, for the day
-- someone re-grants UPDATE on the table by hand.
create or replace function public.tg_profiles_preserve_privileged()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  new.id                := old.id;
  new.is_admin          := old.is_admin;
  new.is_verified       := old.is_verified;
  new.referred_by       := old.referred_by;
  new.created_at        := old.created_at;
  new.date_of_birth     := old.date_of_birth;
  new.suspended_at      := old.suspended_at;
  new.suspended_until   := old.suspended_until;
  new.suspension_reason := old.suspension_reason;
  new.suspended_by      := old.suspended_by;
  return new;
end $$;

create or replace function public.is_suspended(p_user uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
     where id = coalesce(p_user, (select auth.uid()))
       and suspended_at is not null
       and (suspended_until is null or suspended_until > now())
  );
$$;
revoke execute on function public.is_suspended(uuid) from public, anon;
grant  execute on function public.is_suspended(uuid) to authenticated;

create or replace function public.tg_block_suspended()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_suspended() then
    raise exception 'Your account is suspended.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.tg_block_suspended() from public, anon, authenticated;

-- Public participation only.
--
-- Deliberately NOT here: saved_posts, saved_shots, collections,
-- collection_items, close_friends, favorites. Those are private bookkeeping
-- that nobody else can see, so blocking them adds blast radius and buys no
-- safety. Also not notifications or rate_events — those are written on the
-- suspended user's behalf by other people's actions and by the limiter itself,
-- and blocking them would break the app for everyone around them.
do $$
declare t text;
begin
  foreach t in array array[
    'posts','comments','shots','shows','messages','follows','follow_requests',
    'hypes','message_reactions','notes','note_reactions','reposts','poll_votes',
    'reports','message_reports','scheduled_posts','conversations',
    'conversation_members','profile_links','call_sessions','group_calls'
  ] loop
    execute format('drop trigger if exists block_suspended on public.%I', t);
    execute format(
      'create trigger block_suspended before insert on public.%I
         for each row execute function public.tg_block_suspended()', t);
  end loop;
end $$;

-- Editing an existing post is the obvious way round an insert-only block.
do $$
declare t text;
begin
  foreach t in array array['posts','comments','messages','shows','shots'] loop
    execute format('drop trigger if exists block_suspended_update on public.%I', t);
    execute format(
      'create trigger block_suspended_update before update on public.%I
         for each row execute function public.tg_block_suspended()', t);
  end loop;
end $$;

-- The profile is a broadcast channel too — a suspended account renaming itself
-- to an abusive display name still reaches everyone who sees a comment of
-- theirs. But privacy settings and notification preferences must stay editable:
-- a suspension is not a reason to trap someone in settings they can't change.
create or replace function public.tg_block_suspended_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id = (select auth.uid())
     and public.is_suspended()
     and (new.display_name is distinct from old.display_name
       or new.username     is distinct from old.username
       or new.bio          is distinct from old.bio
       or new.avatar_url   is distinct from old.avatar_url
       or new.banner_url   is distinct from old.banner_url
       or new.profile_tags is distinct from old.profile_tags
       or new.anthem       is distinct from old.anthem)
  then
    raise exception 'Your account is suspended.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.tg_block_suspended_profile() from public, anon, authenticated;

drop trigger if exists block_suspended_profile on public.profiles;
create trigger block_suspended_profile before update on public.profiles
  for each row execute function public.tg_block_suspended_profile();

create or replace function public.admin_suspend_user(
  p_user_id uuid,
  p_reason text default null,
  p_days integer default null          -- null = indefinite
) returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := (select auth.uid());
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if p_user_id = v_me then
    raise exception 'You cannot suspend yourself.';
  end if;
  if (select is_admin from public.profiles where id = p_user_id) then
    raise exception 'That account is an admin. Remove admin first.';
  end if;

  update public.profiles
     set suspended_at = now(),
         suspended_until = case when p_days is null then null
                                else now() + (p_days || ' days')::interval end,
         suspension_reason = p_reason,
         suspended_by = v_me
   where id = p_user_id;

  insert into public.moderation_actions
    (actor_id, action, target_type, target_id, target_user_id, reason)
  values (v_me, 'suspend', 'profile', p_user_id, p_user_id, p_reason);
end $$;

create or replace function public.admin_unsuspend_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := (select auth.uid());
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  update public.profiles
     set suspended_at = null, suspended_until = null,
         suspension_reason = null, suspended_by = null
   where id = p_user_id;

  insert into public.moderation_actions
    (actor_id, action, target_type, target_id, target_user_id)
  values (v_me, 'unsuspend', 'profile', p_user_id, p_user_id);
end $$;

revoke execute on function public.admin_suspend_user(uuid, text, integer) from public, anon;
grant  execute on function public.admin_suspend_user(uuid, text, integer) to authenticated;
revoke execute on function public.admin_unsuspend_user(uuid) from public, anon;
grant  execute on function public.admin_unsuspend_user(uuid) to authenticated;
