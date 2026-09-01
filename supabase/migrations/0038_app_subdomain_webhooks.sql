-- ───────────────────────────────────────────────────────────────────
-- 0038: point the pg_cron / pg_net webhooks at app.hypefy.chat
--
-- hypefy.chat now serves the public coming-soon page from a separate
-- Vercel project, and www.hypefy.chat redirects there. The app moved to
-- app.hypefy.chat.
--
-- pg_net does NOT follow redirects, so both webhooks would simply stop
-- firing against the old host — push notifications would go quiet and
-- OneShot photos would never expire, with no error surfaced anywhere.
--
-- Also stops hardcoding the push secret. 0001_baseline.sql:2202 wrote it
-- in plaintext, so that value is already in this repo's git history and
-- should be treated as compromised. This reads it from Vault, the way
-- reap_oneshots() already does.
--
-- PRECONDITION — run this once in the Supabase SQL editor first, outside
-- version control, then rotate PUSH_WEBHOOK_SECRET in Vercel to match:
--
--   select vault.create_secret(
--     '<a new long random string>',
--     'push_webhook_secret',
--     'Shared secret for the /api/push webhook'
--   );
--
-- NOTE: supabase/schema.sql is a snapshot and still shows the old URLs.
-- Regenerate it (and update docs/BACKEND.md) after applying this.
-- ───────────────────────────────────────────────────────────────────

-- Fail loudly now rather than letting push break silently later.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'push_webhook_secret'
  ) then
    raise exception
      'Vault secret "push_webhook_secret" is missing. Create it before applying 0038 — see the header of this migration.';
  end if;
end $$;

create or replace function public.notify_push_webhook()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare v_secret text;
begin
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
end $$;

-- reap_oneshots carries its URL inside the function body, so recreating
-- the function is enough; the cron entry calls it by name and does not
-- need rescheduling.
create or replace function public.reap_oneshots() returns void
language plpgsql security definer set search_path = public as $$
declare v_row record; v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'oneshot_reap_secret';

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
end $$;

revoke all on function public.reap_oneshots() from public, anon, authenticated;
