-- A hype on a Show is filed as a hype on a Show.
--
-- toggle_hype's notification type reads
--
--   case p_target_type when 'post' then 'hype_post'
--                      when 'comment' then 'hype_comment'
--                      else 'hype_shot' end
--
-- so a Show falls into the else and is stored as 'hype_shot'. The body
-- is already right ('hyped your Show'), the target_type is already
-- 'show', and the notifications screen routes on target_type and groups
-- on `type.startsWith("hype_")` — so nothing a reader sees is wrong
-- today, and this is the data being honest rather than a visible fix.
--
-- Which is also why it is safe. 0025 did the opposite of this once:
-- it dropped mention_shot from the UI filter instead of adding the
-- column, and Shot mentions silently reached nobody for months (0102
-- put it back). Checked before changing: notifications.type has no CHECK
-- constraint, the Tune level is `startsWith('hype_')` so 'hype_show'
-- still files under hypes, and the row's link comes from target_type.
--
-- Nothing else in the function changes; the body below is the live
-- definition with one branch added.

create or replace function public.toggle_hype(
  p_target_type text,
  p_target_id uuid,
  p_owner_id uuid default null::uuid
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user    uuid := auth.uid();
  v_exists  uuid;
  v_hyped   boolean;
  v_count   int := 0;
  v_owner   uuid := p_owner_id;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  if p_target_type = 'comment' and v_owner is null then
    select user_id into v_owner from public.comments where id = p_target_id;
  end if;

  select id into v_exists
  from public.hypes
  where user_id = v_user and target_type = p_target_type and target_id = p_target_id;

  if v_exists is not null then
    delete from public.hypes where id = v_exists;
    v_hyped := false;
  else
    insert into public.hypes (user_id, target_type, target_id) values (v_user, p_target_type, p_target_id);
    v_hyped := true;

    if v_owner is not null and v_owner <> v_user then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (v_owner, v_user,
              case p_target_type
                when 'post' then 'hype_post'
                when 'comment' then 'hype_comment'
                when 'show' then 'hype_show'
                else 'hype_shot' end,
              p_target_type, p_target_id,
              case p_target_type
                when 'comment' then 'hyped your comment'
                when 'shot'    then 'hyped your Shot'
                when 'show'    then 'hyped your Show'
                else 'hyped your post' end)
      on conflict do nothing;
    end if;
  end if;

  select count(*) into v_count
  from public.hypes
  where target_type = p_target_type and target_id = p_target_id;

  if p_target_type = 'post' then
    update public.posts set hype_count = v_count where id = p_target_id;
  elsif p_target_type = 'shot' then
    update public.shots set hype_count = v_count where id = p_target_id;
  elsif p_target_type = 'show' then
    update public.shows set hype_count = v_count where id = p_target_id;
  elsif p_target_type = 'comment' then
    update public.comments set hype_count = v_count where id = p_target_id;
  end if;

  return json_build_object('hyped', v_hyped, 'hype_count', v_count);
end;
$function$;
