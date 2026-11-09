-- The Shows reaper has never deleted anything.
--
-- 0181 pointed it at https://www.hypefy.chat/api/shows/reap. Every
-- other cron in this database posts to app.hypefy.chat, which is what
-- capacitor.config.ts loads and what the deployment actually serves.
-- The www host answers, but not that route.
--
-- The evidence, before this migration: net._http_response held thirty
-- responses, all HTTP 404, the most recent at exactly 03:20:00 — the
-- job's scheduled time — and the body was the app's own 404 page. Over
-- the ten days the job had been live the reapable backlog grew from 28
-- to 30 rather than shrinking. Eleven runs, all recorded "succeeded",
-- because the function only queues the posts: pg_net delivers them
-- afterwards and a 404 never reaches the caller.
--
-- Only the host changes. The body of the function is otherwise exactly
-- as 0185 left it.
create or replace function public.reap_expired_shows()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'show_reap_secret';
  -- Not configured yet. Do nothing rather than post unauthenticated.
  if v_secret is null then return; end if;

  for v_row in
    select s.id
      from public.shows s
     where s.expires_at <= now() - interval '30 days'
       and not exists (
         select 1
           from public.showcase_items si
          where si.show_id = s.id
            and si.removed_at is null
       )
     -- Oldest first, and a ceiling: the first run after this ships has
     -- years of backlog to get through, and a thousand HTTP posts from
     -- one transaction is its own outage.
     order by s.expires_at
     limit 200
  loop
    perform net.http_post(
      url := 'https://app.hypefy.chat/api/shows/reap',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-show-reap-secret', v_secret
      ),
      body := jsonb_build_object('show_id', v_row.id)
    );
  end loop;
end $$;

revoke execute on function public.reap_expired_shows() from public, anon, authenticated;
