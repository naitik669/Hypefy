-- Drive the verification pass, without firing requests that cannot work.
--
-- Same shape as reap-oneshots (0033): pg_cron calls a function, the function
-- reads a secret out of Supabase Vault and pg_net posts to the route. The
-- secret in the Vault and MODERATION_VERIFY_SECRET in the app environment are
-- two independent copies of the same value — nothing here can check that they
-- match, which is why the deploy step is to set both.
--
-- Two guards, because a cron job that cannot succeed is worse than no cron
-- job: it fails silently every five minutes forever, and the noise is exactly
-- where a real failure would have been visible.
--
--   * No secret in the Vault means the feature is not deployed yet. Return
--     quietly rather than posting a request that can only come back 401.
--   * Nothing unverified means there is no work. An idle app should not be
--     making 288 pointless requests a day.
--
-- So installing this now is safe: it does nothing at all until somebody adds
-- the secret, and from that moment it starts working with no further change.

create or replace function public.run_media_verification()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
begin
  -- Cheapest check first: existence, not a count, so this stops at the first
  -- row rather than walking the table.
  if not exists (select 1 from public.media_fingerprints where not verified) then
    return;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'moderation_verify_secret';

  if v_secret is null or v_secret = '' then
    return;
  end if;

  -- One batch per call. The route caps itself at twenty images and returns
  -- what it did; raising the cadence is the way to go faster, not raising
  -- the batch, because the route has sixty seconds to finish in.
  perform net.http_post(
    url := 'https://app.hypefy.chat/api/moderation/verify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-moderation-secret', v_secret
    ),
    body := '{}'::jsonb
  );
end;
$function$;

revoke all on function public.run_media_verification() from public, anon, authenticated;

-- Every five minutes, matching reap-oneshots. Twenty images a run is 5,760 a
-- day, far above anything this app will produce for a long time; if a backlog
-- ever does build, this is the number to change.
select cron.schedule(
  'verify-media-hashes',
  '*/5 * * * *',
  $$select public.run_media_verification();$$
);
