-- ─────────────────────────────────────────────────────────────────────
-- Login alerts, and a notification preference write that doesn't clobber.
-- ─────────────────────────────────────────────────────────────────────

-- ── Login alerts ─────────────────────────────────────────────────────
--
-- One row per (user, session) the app has ever rendered for. The FIRST time
-- a session id turns up, that is a new sign-in, and the user hears about it.
--
-- Deliberately NOT a trigger on auth.sessions, which is the obvious place
-- and the wrong one. That trigger would run inside GoTrue's own transaction,
-- so any fault in it — including the net.http_post that notify_push_webhook
-- fires on every notification insert — breaks SIGNING IN, for everybody.
-- Supabase also gives no stability guarantee on the auth schema, so a GoTrue
-- upgrade could quietly change it underneath us.
--
-- The cost of doing it app-side instead, stated plainly: a session that
-- authenticates against GoTrue and never loads a page raises no alert. It
-- catches OAuth, the account switcher and a raw password grant the moment
-- that session touches the app, which is when it starts being able to do
-- anything.
create table if not exists public.auth_sessions_seen (
  user_id    uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  first_seen timestamptz not null default now(),
  primary key (user_id, session_id)
);

alter table public.auth_sessions_seen enable row level security;
revoke all on table public.auth_sessions_seen from anon, authenticated;

create or replace function public.record_login_session(
  p_session_id uuid,
  p_label text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_inserted int := 0;
begin
  if v_uid is null or p_session_id is null then return; end if;

  insert into public.auth_sessions_seen (user_id, session_id)
  values (v_uid, p_session_id)
  on conflict (user_id, session_id) do nothing;

  -- Nothing inserted means we have seen this session before, which is every
  -- call after the first — the alert must fire once per sign-in, not once
  -- per page render.
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return; end if;

  -- actor_id stays null: nobody DID this to you, and notifications.actor_id
  -- has always been nullable. The client renders a shield for actorless
  -- rows rather than an avatar reading "Someone".
  --
  -- The label is a coarse device hint and nothing more. No IP, no full user
  -- agent: this row is selectable by the user and is also the body of a push
  -- payload, so it should not carry anything worth harvesting.
  insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
  values (
    v_uid,
    null,
    'security_alert',
    null,
    null,
    coalesce('New sign-in from ' || nullif(btrim(p_label), ''), 'New sign-in to your account')
  );
end $$;

revoke all on function public.record_login_session(uuid, text) from public, anon;
grant execute on function public.record_login_session(uuid, text) to authenticated;

-- filter_notification_prefs (0022_notif_prefs_messages.sql) is deliberately
-- NOT touched here. Its v_key case has no branch for 'security_alert', so
-- v_key comes out null and the trigger returns new unfiltered — a security
-- alert cannot be switched off by a preference. That is the intended
-- behaviour, not an oversight, and the next person to tidy that case
-- statement should leave it alone.

-- ── Per-key notification preferences ─────────────────────────────────
--
-- The settings screen wrote the whole notif_prefs object on every toggle, so
-- two devices with the panel open would overwrite each other's unrelated
-- choices — last write wins on the entire JSONB. Merging one key server-side
-- makes concurrent toggles compose instead of collide.
--
-- Absent means ON throughout this app; prefs store explicit opt-outs only.
-- Turning something back on therefore REMOVES the key rather than storing
-- true, so the object stays a list of exceptions.
create or replace function public.set_notif_pref(p_key text, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_prefs jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_key not in ('hypes', 'comments', 'follows', 'mentions', 'messages') then
    raise exception 'Unknown notification preference: %', p_key;
  end if;

  update public.profiles
  set notif_prefs = case
        when p_on then coalesce(notif_prefs, '{}'::jsonb) - p_key
        else coalesce(notif_prefs, '{}'::jsonb) || jsonb_build_object(p_key, false)
      end
  where id = v_uid
  returning notif_prefs into v_prefs;

  return coalesce(v_prefs, '{}'::jsonb);
end $$;

revoke all on function public.set_notif_pref(text, boolean) from public, anon;
grant execute on function public.set_notif_pref(text, boolean) to authenticated;
