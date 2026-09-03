-- Stop sending one push per hype.
--
-- hype_post is 155 of 274 notifications (57%) and the least-read of every
-- type at 58%; everything else reads at 79-100%. That is notification
-- fatigue, and it is training people to ignore the ones that matter.
--
-- The ROW still inserts. Only the push is suppressed, and only for the hype
-- bucket, so:
--   * the in-app notifications list is unchanged, and its client-side
--     grouping ("Aman and 4 others hyped your post") still has every actor
--     to count — collapsing rows here would have quietly broken that;
--   * comments, follows and mentions are untouched, because they are read at
--     79-100% and are clearly wanted.
--
-- Within the window the first hype on a post pushes and the rest are silent.
-- The badge and the list still update live.

create or replace function public.notify_push_webhook()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
  v_recent int;
begin
  -- Hypes and reposts share the 'hypes' preference bucket and the same
  -- burst-on-one-target shape.
  if new.type like 'hype\_%' or new.type = 'repost' then
    select count(*) into v_recent
      from public.notifications
     where user_id = new.user_id
       and type = new.type
       and target_id is not distinct from new.target_id
       and id <> new.id
       and created_at > now() - interval '30 minutes';

    -- Already pushed about this target recently — insert the row, stay quiet.
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
