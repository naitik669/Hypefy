-- A scheduled job that cannot do its work must not report success.
--
-- `run_media_verification` has run every five minutes since it was added and
-- has never verified anything. It reads `moderation_verify_secret` from the
-- vault, and that secret has never been set, so it returns at the check --
-- silently, with no warning and nothing in `net._http_response`, because it
-- never gets as far as making a request. pg_cron recorded all 5,083 runs as
-- having succeeded. Twelve media fingerprints sat unverified for sixteen
-- days, which is the only visible trace it left anywhere.
--
-- This is the second time the same failure shape has cost us weeks. The Shows
-- reaper posts to the wrong host and its eleven nightly 404s were also filed
-- as eleven successes, because a function that queues a request through
-- pg_net returns long before anyone learns what the answer was.
--
-- So the jobs below now raise when the secret they need is absent. The cost
-- is noise: while `moderation_verify_secret` is unset, pg_cron will record
-- 288 failures a day in `cron.job_run_details` instead of 288 successes.
-- That is the point. A row saying "failed" is a thing a person or a monitor
-- can find; a row saying "succeeded" about work that did not happen is worse
-- than no row at all.
--
-- Deliberately not done here:
--
--   * No shared `vault_secret()` helper. A SECURITY DEFINER function that
--     returns a decrypted secret is a standing privilege-escalation risk --
--     CREATE FUNCTION grants EXECUTE to PUBLIC by default, and one future
--     "grant execute on all functions in schema public" would hand every
--     signed-in user every secret the app holds. Six lines repeated four
--     times is the cheaper mistake.
--
--   * `reap_expired_shows` is left exactly as it is. It needs the same
--     treatment, but its own fix (the wrong host) is 0192, and restating the
--     function here would quietly carry 0192's change in with it.
--
-- Only `run_media_verification` changes behaviour in practice: the other
-- three read secrets that are set, so for them this is a guard that has
-- nothing to guard against yet.

-- ── the one that is actually broken ──────────────────────────────────────

create or replace function public.run_media_verification()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_secret text;
  v_waiting int;
begin
  select count(*) into v_waiting from public.media_fingerprints where not verified;

  -- Nothing to do is a real answer, and stays quiet.
  if v_waiting = 0 then
    return;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'moderation_verify_secret';

  if v_secret is null or v_secret = '' then
    raise exception
      'moderation_verify_secret is not set in the vault; % media fingerprint(s) cannot be verified', v_waiting
      using hint = 'Add it in the Supabase dashboard under Integrations -> Vault, with the same value as MODERATION_VERIFY_SECRET in the Vercel project. Both halves are needed: the vault value is the header this job sends, and the Vercel value is what /api/moderation/verify compares it against.';
  end if;

  perform net.http_post(
    url := 'https://app.hypefy.chat/api/moderation/verify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-moderation-secret', v_secret
    ),
    body := '{}'::jsonb
  );
end;
$fn$;

-- ── the same guard, where there is currently nothing to guard ────────────

create or replace function public.reap_oneshots()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare v_row record; v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'oneshot_reap_secret';

  -- Without this the loop posted a null header and marked every row reaped,
  -- so the rows were gone and the files were not: /api/oneshot/reap answers
  -- 401 to an unsigned request, and `reaped_at` was already set.
  if v_secret is null or v_secret = '' then
    raise exception 'oneshot_reap_secret is not set in the vault; one-shot media cannot be deleted'
      using hint = 'Add it under Integrations -> Vault, matching ONESHOT_REAP_SECRET in Vercel.';
  end if;

  for v_row in
    select message_id, storage_path from public.oneshots
    where opened_at is null and reaped_at is null and expires_at <= now()
  loop
    perform net.http_post(
      url := 'https://app.hypefy.chat/api/oneshot/reap',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-oneshot-reap-secret', v_secret
      ),
      body := jsonb_build_object('message_id', v_row.message_id, 'storage_path', v_row.storage_path)
    );
    update public.oneshots set reaped_at = now() where message_id = v_row.message_id;
  end loop;
end;
$fn$;

create or replace function public.send_hype_summaries()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_secret text;
  r record;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_webhook_secret';

  if v_secret is null or v_secret = '' then
    raise exception 'push_webhook_secret is not set in the vault; daily hype summaries cannot be sent'
      using hint = 'Add it under Integrations -> Vault, matching PUSH_WEBHOOK_SECRET in Vercel.';
  end if;

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
end;
$fn$;

-- ── the trigger, which must never block the thing it is reacting to ──────

-- This one fires on every notification insert. Raising here would mean a
-- missing secret stopped the app recording notifications at all, which is a
-- great deal worse than not pushing them, so it warns and carries on. It no
-- longer sends the request: a null header is a guaranteed 401, and a warning
-- in the Postgres log says why far more clearly than a rejected POST.
create or replace function public.notify_push_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_secret text;
  v_recent int;
  v_prefs jsonb;
begin
  select coalesce(notif_prefs, '{}'::jsonb) into v_prefs from public.profiles where id = new.user_id;
  v_prefs := coalesce(v_prefs, '{}'::jsonb);

  if new.type not in ('security_alert', 'incoming_call') then
    begin
      if (v_prefs ->> 'paused_until')::timestamptz > now() then
        return new;
      end if;
    exception when others then
      null;
    end;

    if v_prefs -> 'only_following' = 'true'::jsonb
       and new.actor_id is not null
       and not exists (select 1 from public.follows f where f.follower_id = new.user_id and f.following_id = new.actor_id) then
      return new;
    end if;
  end if;

  if new.type = 'spotlight_page' and v_prefs -> 'spotlight_pages' is distinct from 'true'::jsonb then
    return new;
  end if;

  if new.type like 'hype\_%' or new.type = 'repost' then
    if v_prefs -> 'daily_summary' = 'true'::jsonb then
      return new;
    end if;

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

  if v_secret is null or v_secret = '' then
    raise warning 'push_webhook_secret is not set in the vault; no push sent for notification %', new.id;
    return new;
  end if;

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
end;
$fn$;
