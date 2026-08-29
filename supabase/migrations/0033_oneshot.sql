-- OneShot: a view-once photo in DMs. The media is genuinely deleted after the
-- single view — this is a real, server-enforced guarantee (unlike the app/chat
-- lock above, which is explicitly not one). Web-first prototype: nothing here
-- can stop a recipient screenshotting their own screen, which is called out in
-- the send-time UI copy (Phase 2), not hidden behind the feature.

-- ── Storage ──────────────────────────────────────────────────────────────
-- public=false (unlike every other bucket in this app) and a tighter 10 MB
-- cap than chat-media's 50 MB, since the Node proxy route (Phase 2) streams
-- the full object through the function on every open.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'oneshot-media', 'oneshot-media', false, 10485760,
  array['image/jpeg','image/jpg','image/png','image/webp','image/heic']
)
on conflict (id) do nothing;

-- Sender can upload to their own folder — mirrors chat_media_insert.
create policy "oneshot_media_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'oneshot-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
-- Deliberately NO select policy and NO delete policy: only the service-role
-- Node routes in Phase 2 (which bypass storage RLS entirely) ever read or
-- delete an object. Neither the sender nor the recipient can read it directly
-- — the whole point is that "having the URL" is never enough.

-- ── oneshots ─────────────────────────────────────────────────────────────
create table if not exists public.oneshots (
  message_id uuid primary key references public.messages(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  storage_path text not null,
  expires_at timestamptz not null default now() + interval '24 hours',
  opened_at timestamptz,
  opened_by uuid references public.profiles(id) on delete set null,
  reaped_at timestamptz
);
create index if not exists oneshots_expiry_idx on public.oneshots(expires_at) where opened_at is null;

-- RLS `using (false)`: no client, not even the sender or recipient, can ever
-- SELECT this table directly. storage_path must never reach the browser —
-- status (opened/not) is exposed through the `messages` row instead, and the
-- signed claim below is the only way to get the path out, and only once.
alter table public.oneshots enable row level security;
create policy "oneshots: no direct access" on public.oneshots for select using (false);
revoke all on table public.oneshots from anon, authenticated;

-- ── send_message: carry the storage path ────────────────────────────────
-- Adding a parameter creates a new overload; PostgREST would then see two
-- candidate functions for the same call and refuse as ambiguous. Drop the
-- current 6-arg signature first, then recreate with the 7th.
drop function if exists public.send_message(uuid, text, text, uuid, uuid, uuid);

create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text default null,
  p_kind text default 'text',
  p_post_id uuid default null,
  p_reply_to_id uuid default null,
  p_shot_id uuid default null,
  p_storage_path text default null
)
  returns json language plpgsql security definer set search_path to 'public'
as $$
declare v_me uuid := auth.uid(); v_msg public.messages%rowtype; v_prev_count int; v_other uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.is_conv_member(p_conversation_id) then raise exception 'Not a member'; end if;
  -- p_storage_path counts as content, same as p_post_id/p_shot_id: a OneShot
  -- carries no body, so without this the original empty-message guard would
  -- reject every OneShot send.
  if (p_body is null or btrim(p_body) = '') and p_post_id is null and p_shot_id is null and p_storage_path is null then
    raise exception 'Empty message';
  end if;
  if p_kind = 'oneshot' and p_storage_path is null then
    raise exception 'OneShot requires a storage path';
  end if;

  -- Block guard: a member who blocked me cannot receive my messages.
  if exists (
    select 1 from public.conversation_members cm
    join public.blocked_users b on b.blocker_id = cm.user_id and b.blocked_id = v_me
    where cm.conversation_id = p_conversation_id and cm.user_id <> v_me
  ) then
    raise exception 'blocked';
  end if;

  select count(*) into v_prev_count from public.messages where conversation_id = p_conversation_id;
  insert into public.messages (conversation_id, sender_id, body, kind, post_id, shot_id, reply_to_id)
    -- OneShot stores nothing in body — the path lives only in `oneshots`,
    -- which no client can read.
    values (
      p_conversation_id, v_me,
      case when p_kind = 'oneshot' then null else nullif(btrim(p_body), '') end,
      p_kind, p_post_id, p_shot_id, p_reply_to_id
    )
    returning * into v_msg;

  if p_kind = 'oneshot' then
    insert into public.oneshots (message_id, sender_id, conversation_id, storage_path)
    values (v_msg.id, v_me, p_conversation_id, p_storage_path);
  end if;

  update public.conversations set last_message_at = now(), last_message_id = v_msg.id, updated_at = now()
    where id = p_conversation_id;
  select user_id into v_other from public.conversation_members
    where conversation_id = p_conversation_id and user_id <> v_me limit 1;
  if v_other is not null and (v_prev_count = 0 or p_kind in ('post','shot')) then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (v_other, v_me,
      case when p_kind in ('post','shot') then 'dm_post_shared' else 'new_message' end,
      'conversation', p_conversation_id,
      case when p_kind = 'post' then 'shared a post with you'
           when p_kind = 'shot' then 'shared a Shot with you'
           else 'sent you a message' end);
  end if;
  return json_build_object('id', v_msg.id, 'conversation_id', v_msg.conversation_id, 'sender_id', v_msg.sender_id,
    'body', v_msg.body, 'kind', v_msg.kind, 'post_id', v_msg.post_id, 'shot_id', v_msg.shot_id,
    'reply_to_id', v_msg.reply_to_id, 'is_unsent', v_msg.is_unsent, 'created_at', v_msg.created_at);
end; $$;

revoke all on function public.send_message(uuid, text, text, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text, text, uuid, uuid, uuid, text) to authenticated;

-- ── claim_oneshot: the atomic single-view claim ─────────────────────────
-- A single conditional UPDATE is the compare-and-swap: it takes a row lock,
-- so two concurrent opens serialize on it. The second re-evaluates its
-- `opened_at is null` against the now-committed row from the first and
-- matches nothing — no separate unique constraint or FOR UPDATE needed.
--
-- The sender needs to see "Opened" once the recipient views it, but oneshots
-- has `for select using (false)` — no client can read it, including the
-- sender. Piggyback the flag onto messages.metadata instead: RealChatView
-- already has a live subscription on messages UPDATE for this conversation
-- (used by unsend/edit) that spreads whatever columns the row carries into
-- state, so this needs no new realtime plumbing.
create or replace function public.claim_oneshot(p_message_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid()); v_path text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.rate_limit('oneshot_open', 60, interval '1 hour');

  update public.oneshots
    set opened_at = now(), opened_by = v_uid
  where message_id = p_message_id
    and opened_at is null
    and reaped_at is null
    and expires_at > now()
    and sender_id <> v_uid
    and public.is_conv_member(conversation_id)
  returning storage_path into v_path;

  if v_path is null then
    raise exception 'This photo is no longer available.';
  end if;

  update public.messages
    set metadata = jsonb_build_object('oneshot_opened', true, 'oneshot_opened_at', now())
  where id = p_message_id;

  return v_path;
end $$;

revoke all on function public.claim_oneshot(uuid) from public, anon;
grant execute on function public.claim_oneshot(uuid) to authenticated;

-- ── reap_oneshots: mark expired-unopened rows, then trigger the actual
--    storage delete via the same pg_net-webhook pattern notify_push_webhook
--    already uses (0001_baseline.sql:2193) — Postgres itself cannot delete
--    Storage objects, only the Storage API (via a service-role Node route)
--    can. Runs every 5 minutes; the 24h unviewed TTL doesn't need tighter.
--
-- The webhook secret lives in Supabase Vault, not as a literal in this file.
-- notify_push_webhook (0001_baseline.sql:2160,2202) hardcoded its secret
-- directly in the migration — which means that value is already sitting in
-- plaintext in this repo's git history. Not repeating that mistake: create
-- the secret once via `select vault.create_secret(value, 'oneshot_reap_secret',
-- description);` outside of version control (see docs/BACKEND.md), and read
-- it back through vault.decrypted_secrets at call time.
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
      url := 'https://www.hypefy.chat/api/oneshot/reap',
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

select cron.schedule('reap-oneshots', '*/5 * * * *', 'select public.reap_oneshots();');
