-- A hype on a Shot said "hyped your post".
--
-- toggle_hype wrote one body for everything that was not a comment, so every
-- hype_shot row in Activity claimed to be about a post — next to a repost row
-- on the same Shot that said "rehyped your Shot", because the rehype path
-- (0106) got this right and the hype path never did. Shows had the same
-- problem and no wording of their own at all.
--
-- The function is otherwise unchanged from its baseline definition.

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

  -- Resolve the owner for comments server-side
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
                else 'hype_shot' end,
              p_target_type, p_target_id,
              -- Shot and Show capitalised, as everywhere else they are named.
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

-- The rows already written. Same correction 0106 made for rehypes.
update public.notifications
   set body = case target_type when 'shot' then 'hyped your Shot' else 'hyped your Show' end
 where type in ('hype_shot')
   and target_type in ('shot', 'show')
   and body = 'hyped your post';
