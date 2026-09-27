-- @mentioning someone in a Shot now reaches them.
--
-- It never did. 0025 spelled out why while fixing its neighbours:
--
--   "mention_shot is dropped from the UI filter since shots have no
--    mentions column."
--
-- So the notification type was removed rather than the gap closed, and a
-- Shot caption reading "@aman look at this" has been telling Aman nothing
-- ever since. Posts have carried a mentions column and a trigger from the
-- baseline; this is the same thing for the other half of the app.
--
-- Nothing on the read side needs changing: the notifications screen already
-- routes target_type 'shot' to /shots/<id>, and already files every
-- mention_% type under the "mentions" Tune level.

alter table public.shots
  add column if not exists mentions text[] not null default '{}';

comment on column public.shots.mentions is
  'Usernames @mentioned in the caption, lowercased. Drives mention_shot notifications.';

create or replace function public.handle_shot_mentions()
returns trigger language plpgsql security definer as $$
declare
  v_mention text;
  v_target uuid;
begin
  if new.mentions is null then return new; end if;
  foreach v_mention in array new.mentions loop
    -- Mentioning yourself is not a notification.
    select id into v_target from public.profiles
      where lower(username) = lower(v_mention) and id <> new.user_id;
    if v_target is not null then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (v_target, new.user_id, 'mention_shot', 'shot', new.id, 'mentioned you in a Shot')
      on conflict do nothing;
    end if;
  end loop;
  return new;
end $$;

alter function public.handle_shot_mentions() set search_path = public;

-- Trigger functions are not an API. 0052 revoked execute on every one of
-- these from the client roles; this one joins them rather than being the
-- single exception.
revoke execute on function public.handle_shot_mentions() from public, anon, authenticated;

drop trigger if exists on_shot_mentions on public.shots;
create trigger on_shot_mentions after insert on public.shots
  for each row execute function public.handle_shot_mentions();
