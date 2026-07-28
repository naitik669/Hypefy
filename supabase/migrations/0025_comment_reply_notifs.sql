-- Notification type reconciliation. The notifications filter listed
-- comment_shot / comment_reply / mention_shot, but no code produced them:
-- replying to a comment notified no one but the post owner, and shot comments
-- were typed 'comment_post'. Fix the two that are real features (reply +
-- shot-comment typing); mention_shot is dropped from the UI filter since shots
-- have no mentions column.

create or replace function public.create_comment(
  p_post_id uuid, p_body text, p_owner_id uuid default null, p_parent_id uuid default null
) returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
  v_parent_author uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  insert into public.comments (post_id, user_id, body, parent_id)
  values (p_post_id, v_user, trim(p_body), p_parent_id)
  returning id into v_id;

  update public.posts set comment_count = (
    select count(*) from public.comments where post_id = p_post_id and deleted_at is null
  ) where id = p_post_id;

  if p_parent_id is null then
    -- top-level comment → notify the post owner
    if p_owner_id is not null and p_owner_id <> v_user then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (p_owner_id, v_user, 'comment_post', 'post', p_post_id, 'commented on your post')
      on conflict do nothing;
    end if;
  else
    -- reply → notify the parent comment's author
    select user_id into v_parent_author from public.comments where id = p_parent_id;
    if v_parent_author is not null and v_parent_author <> v_user then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (v_parent_author, v_user, 'comment_reply', 'post', p_post_id, 'replied to your comment')
      on conflict do nothing;
    end if;
  end if;

  return v_id;
end;
$function$;

create or replace function public.create_shot_comment(
  p_shot_id uuid, p_body text, p_owner_id uuid default null, p_parent_id uuid default null
) returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
  v_parent_author uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  insert into public.comments (shot_id, user_id, body, parent_id)
  values (p_shot_id, v_user, trim(p_body), p_parent_id)
  returning id into v_id;

  update public.shots set comment_count = (
    select count(*) from public.comments where shot_id = p_shot_id and deleted_at is null
  ) where id = p_shot_id;

  if p_parent_id is null then
    if p_owner_id is not null and p_owner_id <> v_user then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (p_owner_id, v_user, 'comment_shot', 'shot', p_shot_id, 'commented on your Shot')
      on conflict do nothing;
    end if;
  else
    select user_id into v_parent_author from public.comments where id = p_parent_id;
    if v_parent_author is not null and v_parent_author <> v_user then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (v_parent_author, v_user, 'comment_reply', 'shot', p_shot_id, 'replied to your comment')
      on conflict do nothing;
    end if;
  end if;

  return v_id;
end;
$function$;
