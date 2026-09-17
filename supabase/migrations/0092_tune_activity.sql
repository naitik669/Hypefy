-- Tune your Activity.
--
-- profiles.notif_prefs grows from a list of opt-outs into the whole Tune
-- sheet. Absent keys keep meaning "the default", so every existing object
-- still reads the same.
--
--   hypes, comments, mentions,   absent/true  everything
--   follows, shares              "highlights" only from people you follow
--                                false/"off"  nothing
--   messages                     boolean, as before (Settings)
--   spotlight_pages              absent: not decided yet. The rows still
--                                arrive, silently, so Activity can ask.
--                                true / false once answered
--   milestones                   absent/true on, false off
--   shows_posted, back_after     absent/false off, true on
--   only_following               true: no push from people you don't follow
--   daily_summary                true: hypes never push; one summary a day
--   paused_until                 timestamp: no push until then
--   muted                        array of user ids: nothing from them here
--
-- The new kinds of notification:
--   spotlight_page  a friend adds a page to their Spotlight
--   show_posted     someone you follow posts a Show ("Friends go live")
--   milestone       your post or Shot passes 100, 500, 1000… hypes
--   back_after      someone you follow posts after three weeks away

-- ── Which preference a notification answers to ───────────────────────
create or replace function public.notif_pref_key(p_type text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_type like 'hype\_%' or p_type = 'repost' then 'hypes'
    when p_type like 'comment\_%' then 'comments'
    when p_type in ('follow', 'follow_request', 'follow_accepted') then 'follows'
    when p_type like 'mention\_%' then 'mentions'
    when p_type = 'dm_post_shared' then 'shares'
    when p_type = 'new_message' then 'messages'
    when p_type = 'spotlight_page' then 'spotlight_pages'
    when p_type = 'show_posted' then 'shows_posted'
    when p_type = 'milestone' then 'milestones'
    when p_type = 'back_after' then 'back_after'
    else null
  end;
$$;

-- ── What is allowed into Activity at all ─────────────────────────────
create or replace function public.filter_notification_prefs()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_prefs jsonb;
  v_key text := public.notif_pref_key(new.type);
  v_val jsonb;
begin
  select coalesce(notif_prefs, '{}'::jsonb) into v_prefs from public.profiles where id = new.user_id;
  v_prefs := coalesce(v_prefs, '{}'::jsonb);

  -- Muted people stay out of Activity. What you cannot miss still comes
  -- through: messages, calls, follow requests and security alerts are not
  -- "activity" and muting from here should not silence them.
  if new.actor_id is not null
     and jsonb_typeof(v_prefs -> 'muted') = 'array'
     and (v_prefs -> 'muted') ? new.actor_id::text
     and new.type not in ('new_message', 'dm_post_shared', 'incoming_call', 'missed_call', 'follow_request', 'security_alert') then
    return null;
  end if;

  if v_key is null then return new; end if;
  v_val := v_prefs -> v_key;

  -- A share to a chat also answers to the Messages switch in Settings.
  if new.type = 'dm_post_shared' and v_prefs -> 'messages' = 'false'::jsonb then
    return null;
  end if;

  if v_val = 'false'::jsonb or v_val = '"off"'::jsonb then
    return null;
  end if;

  -- Off unless switched on.
  if v_key in ('shows_posted', 'back_after') and v_val is distinct from 'true'::jsonb then
    return null;
  end if;

  -- Highlights: only from people you follow. A follow request is always
  -- let through, since it is a question only you can answer.
  if v_val = '"highlights"'::jsonb
     and new.type <> 'follow_request'
     and new.actor_id is not null
     and not exists (select 1 from public.follows f where f.follower_id = new.user_id and f.following_id = new.actor_id) then
    return null;
  end if;

  return new;
end $$;

-- ── What pings the phone ─────────────────────────────────────────────
create or replace function public.notify_push_webhook()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
  v_recent int;
  v_prefs jsonb;
begin
  select coalesce(notif_prefs, '{}'::jsonb) into v_prefs from public.profiles where id = new.user_id;
  v_prefs := coalesce(v_prefs, '{}'::jsonb);

  -- Security alerts and calls always ring; everything else respects the
  -- break, and the "only people I follow" switch.
  if new.type not in ('security_alert', 'incoming_call') then
    begin
      if (v_prefs ->> 'paused_until')::timestamptz > now() then
        return new;
      end if;
    exception when others then
      null; -- an unreadable timestamp is no pause
    end;

    if v_prefs -> 'only_following' = 'true'::jsonb
       and new.actor_id is not null
       and not exists (select 1 from public.follows f where f.follower_id = new.user_id and f.following_id = new.actor_id) then
      return new;
    end if;
  end if;

  -- An undecided Spotlight row is there to be asked about, not to ring.
  if new.type = 'spotlight_page' and v_prefs -> 'spotlight_pages' is distinct from 'true'::jsonb then
    return new;
  end if;

  if new.type like 'hype\_%' or new.type = 'repost' then
    -- Hypes come once a day in a summary instead.
    if v_prefs -> 'daily_summary' = 'true'::jsonb then
      return new;
    end if;

    -- Hypes and reposts share the 'hypes' preference bucket and the same
    -- burst-on-one-target shape: the first hype on a target in 30 minutes
    -- pushes, the rest stay quiet.
    select count(*) into v_recent
      from public.notifications
     where user_id = new.user_id
       and type = new.type
       and target_id is not distinct from new.target_id
       and id <> new.id
       and created_at > now() - interval '30 minutes';

    if v_recent > 0 then
      return new;
    end if;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_webhook_secret';

  perform net.http_post(
    url := 'https://app.hypefy.chat/api/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_secret
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
end $function$;

-- ── Setting it ───────────────────────────────────────────────────────
-- One key at a time, merged server-side, so two devices do not overwrite
-- each other's choices. A null value goes back to the default.
create or replace function public.set_activity_pref(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_prefs jsonb;
  v_value jsonb := case when p_value = 'null'::jsonb then null else p_value end;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  if p_key in ('hypes', 'comments', 'mentions', 'follows', 'shares') then
    if v_value is not null and v_value not in ('"highlights"'::jsonb, 'false'::jsonb) then
      raise exception 'Invalid value for %', p_key;
    end if;
  elsif p_key in ('spotlight_pages', 'shows_posted', 'milestones', 'back_after', 'only_following', 'daily_summary') then
    if v_value is not null and jsonb_typeof(v_value) <> 'boolean' then
      raise exception 'Invalid value for %', p_key;
    end if;
  elsif p_key = 'paused_until' then
    if v_value is not null then
      if jsonb_typeof(v_value) <> 'string'
         or (v_value #>> '{}')::timestamptz > now() + interval '31 days' then
        raise exception 'Invalid pause';
      end if;
    end if;
  else
    raise exception 'Unknown notification preference: %', p_key;
  end if;

  update public.profiles
     set notif_prefs = case
           when v_value is null then coalesce(notif_prefs, '{}'::jsonb) - p_key
           else coalesce(notif_prefs, '{}'::jsonb) || jsonb_build_object(p_key, v_value)
         end
   where id = v_uid
  returning notif_prefs into v_prefs;

  return coalesce(v_prefs, '{}'::jsonb);
end $$;

revoke all on function public.set_activity_pref(text, jsonb) from public, anon;
grant execute on function public.set_activity_pref(text, jsonb) to authenticated;

create or replace function public.set_activity_mute(p_user uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_prefs jsonb;
  v_list jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_user is null or p_user = v_uid then raise exception 'Invalid user'; end if;

  select coalesce(case when jsonb_typeof(notif_prefs -> 'muted') = 'array' then notif_prefs -> 'muted' end, '[]'::jsonb)
    into v_list from public.profiles where id = v_uid;
  v_list := coalesce(v_list, '[]'::jsonb) - p_user::text;
  if p_on then
    if jsonb_array_length(v_list) >= 500 then raise exception 'Too many muted people'; end if;
    v_list := v_list || to_jsonb(p_user::text);
  end if;

  update public.profiles
     set notif_prefs = case
           when jsonb_array_length(v_list) = 0 then coalesce(notif_prefs, '{}'::jsonb) - 'muted'
           else coalesce(notif_prefs, '{}'::jsonb) || jsonb_build_object('muted', v_list)
         end
   where id = v_uid
  returning notif_prefs into v_prefs;

  -- Clear what they already left here, so muting takes effect on screen now.
  if p_on then
    delete from public.notifications
     where user_id = v_uid and actor_id = p_user
       and type not in ('new_message', 'dm_post_shared', 'incoming_call', 'missed_call', 'follow_request', 'security_alert');
  end if;

  return coalesce(v_prefs, '{}'::jsonb);
end $$;

revoke all on function public.set_activity_mute(uuid, boolean) from public, anon;
grant execute on function public.set_activity_mute(uuid, boolean) to authenticated;

-- ── New kinds ────────────────────────────────────────────────────────

-- A page added to Spotlight: to everyone who can see it (the same rule as
-- get_notes). A page written over today's replaces its notification rather
-- than adding a second.
create or replace function public.notify_spotlight_page()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' and new.created_at is not distinct from old.created_at then
    return new;
  end if;
  if new.expires_at <= now() then return new; end if;

  delete from public.notifications
   where actor_id = new.user_id and type = 'spotlight_page';

  insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
  select f1.follower_id, new.user_id, 'spotlight_page', 'profile', new.user_id, 'added a page to their Spotlight'
    from public.follows f1
    join public.follows f2 on f2.follower_id = new.user_id and f2.following_id = f1.follower_id
   where f1.following_id = new.user_id
     and (new.audience = 'mutual'
          or exists (select 1 from public.close_friends cf where cf.user_id = new.user_id and cf.friend_id = f1.follower_id))
     and not exists (
       select 1 from public.blocked_users b
        where (b.blocker_id = f1.follower_id and b.blocked_id = new.user_id)
           or (b.blocker_id = new.user_id and b.blocked_id = f1.follower_id))
   limit 5000;

  return new;
end $$;

drop trigger if exists on_note_spotlight_page on public.notes;
create trigger on_note_spotlight_page
  after insert or update of created_at on public.notes
  for each row execute function public.notify_spotlight_page();

-- A Show from someone you follow, for those who switched it on. At most one
-- per person every six hours, so a run of Shows is one ping.
create or replace function public.notify_show_posted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(new.is_showcase, false) then return new; end if;

  insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
  select f.follower_id, new.user_id, 'show_posted', 'show', new.id, 'posted a Show'
    from public.follows f
    join public.profiles p on p.id = f.follower_id
   where f.following_id = new.user_id
     and p.notif_prefs -> 'shows_posted' = 'true'::jsonb
     and not exists (
       select 1 from public.notifications n
        where n.user_id = f.follower_id and n.actor_id = new.user_id and n.type = 'show_posted'
          and n.created_at > now() - interval '6 hours')
     and not exists (
       select 1 from public.blocked_users b
        where (b.blocker_id = f.follower_id and b.blocked_id = new.user_id)
           or (b.blocker_id = new.user_id and b.blocked_id = f.follower_id));

  return new;
end $$;

drop trigger if exists on_show_posted on public.shows;
create trigger on_show_posted
  after insert on public.shows
  for each row execute function public.notify_show_posted();

-- Milestones on hype counts. Each level once per post or Shot.
create or replace function public.notify_hype_milestone()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_level int;
  v_kind text := case tg_table_name when 'posts' then 'post' else 'shot' end;
begin
  select max(l) into v_level
    from unnest(array[50, 100, 500, 1000, 5000, 10000, 50000, 100000]) l
   where coalesce(old.hype_count, 0) < l and new.hype_count >= l;
  if v_level is null then return new; end if;

  if not exists (
    select 1 from public.notifications
     where user_id = new.user_id and type = 'milestone' and target_id = new.id
       and body = format('Your %s passed %s hypes', v_kind, v_level)
  ) then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (new.user_id, null, 'milestone', v_kind, new.id, format('Your %s passed %s hypes', v_kind, v_level));
  end if;
  return new;
end $$;

drop trigger if exists on_post_hype_milestone on public.posts;
create trigger on_post_hype_milestone
  after update of hype_count on public.posts
  for each row when (new.hype_count > coalesce(old.hype_count, 0))
  execute function public.notify_hype_milestone();

drop trigger if exists on_shot_hype_milestone on public.shots;
create trigger on_shot_hype_milestone
  after update of hype_count on public.shots
  for each row when (new.hype_count > coalesce(old.hype_count, 0))
  execute function public.notify_hype_milestone();

-- Back after a while: someone you follow posts after three weeks without.
create or replace function public.notify_back_after()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_last timestamptz;
  v_weeks int;
begin
  select max(created_at) into v_last
    from public.posts
   where user_id = new.user_id and id <> new.id and removed_at is null;
  if v_last is null or v_last > now() - interval '21 days' then return new; end if;
  v_weeks := floor(extract(epoch from now() - v_last) / 604800);

  insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
  select f.follower_id, new.user_id, 'back_after', 'post', new.id,
         format('posted for the first time in %s weeks', v_weeks)
    from public.follows f
    join public.profiles p on p.id = f.follower_id
   where f.following_id = new.user_id
     and p.notif_prefs -> 'back_after' = 'true'::jsonb
     and not exists (
       select 1 from public.blocked_users b
        where (b.blocker_id = f.follower_id and b.blocked_id = new.user_id)
           or (b.blocker_id = new.user_id and b.blocked_id = f.follower_id));

  return new;
end $$;

drop trigger if exists on_post_back_after on public.posts;
create trigger on_post_back_after
  after insert on public.posts
  for each row execute function public.notify_back_after();

-- ── The daily summary ────────────────────────────────────────────────
-- 21:00 in India (15:30 UTC). A push only: the hypes themselves are already
-- in Activity, so a summary row there would be the same news twice.
create or replace function public.send_hype_summaries()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_secret text;
  r record;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_webhook_secret';

  for r in
    select n.user_id, count(*) as hypes
      from public.notifications n
      join public.profiles p on p.id = n.user_id
     where p.notif_prefs -> 'daily_summary' = 'true'::jsonb
       and (n.type like 'hype\_%' or n.type = 'repost')
       and n.created_at > now() - interval '24 hours'
       and not coalesce(
             (case when p.notif_prefs ->> 'paused_until' ~ '^\d{4}-' then (p.notif_prefs ->> 'paused_until')::timestamptz end) > now(),
             false)
     group by n.user_id
  loop
    perform net.http_post(
      url := 'https://app.hypefy.chat/api/push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object(
        'id', gen_random_uuid(),
        'user_id', r.user_id,
        'actor_id', null,
        'type', 'hype_summary',
        'target_type', null,
        'target_id', null,
        'body', format('%s %s today', r.hypes, case when r.hypes = 1 then 'hype' else 'hypes' end)
      )
    );
  end loop;
end $$;

revoke all on function public.send_hype_summaries() from public, anon, authenticated;

select cron.unschedule('send-hype-summaries')
 where exists (select 1 from cron.job where jobname = 'send-hype-summaries');
select cron.schedule('send-hype-summaries', '30 15 * * *', 'select public.send_hype_summaries();');
