-- Rehypes get their own notification switch.
--
-- "X rehyped your post" was filed under Hypes: one switch for both. They are
-- different news. A hype is a tap; a rehype put your post in front of someone
-- else's followers. Someone who has turned hypes down to nothing (they get a
-- lot of them) very likely still wants to hear about the second kind, and
-- had no way to say so.
--
-- The push throttle and the daily summary still count the two together: those
-- are about how often the phone buzzes, not about which news you asked for.

-- Anyone who had already chosen a level for hypes had, by the old rule, chosen
-- it for rehypes too. Keep that choice rather than turning rehypes back on.
update public.profiles
   set notif_prefs = notif_prefs || jsonb_build_object('rehypes', notif_prefs -> 'hypes')
 where notif_prefs ? 'hypes'
   and not (notif_prefs ? 'rehypes');

create or replace function public.notif_pref_key(p_type text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_type = 'repost' then 'rehypes'
    when p_type like 'hype\_%' then 'hypes'
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

  if p_key in ('hypes', 'rehypes', 'comments', 'mentions', 'follows', 'shares') then
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

create or replace function public.set_notif_pref(p_key text, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_prefs jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_key not in ('hypes', 'rehypes', 'comments', 'follows', 'mentions', 'messages') then
    raise exception 'Unknown notification preference: %', p_key;
  end if;

  update public.profiles
  set notif_prefs = case
        when p_on then coalesce(notif_prefs, '{}'::jsonb) - p_key
        else coalesce(notif_prefs, '{}'::jsonb) || jsonb_build_object(p_key, false)
      end
  where id = v_uid
  returning notif_prefs into v_prefs;

  return coalesce(v_prefs, '{}'::jsonb);
end $$;
