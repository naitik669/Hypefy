-- Fix the dead "Messages" notification preference. filter_notification_prefs()
-- matched the messages opt-out with `new.type like 'message%'`, but the real DM
-- notification types are 'new_message' and 'dm_post_shared' — neither starts
-- with "message", so toggling the Messages preference off did nothing. Match the
-- actual types instead.

create or replace function public.filter_notification_prefs()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prefs jsonb;
  v_key text;
begin
  v_key := case
    when new.type like 'hype_%' or new.type = 'repost' then 'hypes'
    when new.type like 'comment_%' then 'comments'
    when new.type = 'follow' then 'follows'
    when new.type like 'mention_%' then 'mentions'
    when new.type in ('new_message', 'dm_post_shared') then 'messages'
    else null
  end;
  if v_key is null then return new; end if;

  select notif_prefs into v_prefs from public.profiles where id = new.user_id;
  if v_prefs is not null and v_prefs ->> v_key = 'false' then
    return null; -- recipient opted out of this type
  end if;
  return new;
end $$;
