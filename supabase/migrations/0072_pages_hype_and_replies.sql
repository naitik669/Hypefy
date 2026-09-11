-- Pages (what the app called Diary): hype, quiet reactions, and replies that
-- arrive in DMs as an embed of the page.

-- 1. Reactions no longer notify. The emoji arrives in DMs (below), and the
--    page's owner sees everyone's reactions fly up over their page; a
--    notification on top of both was the same news three times.
create or replace function public.react_to_note(p_owner uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := (select auth.uid()); v_created timestamptz;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if char_length(coalesce(p_emoji, '')) = 0 then raise exception 'No emoji'; end if;
  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = v_uid and b.blocked_id = p_owner)
       or (b.blocker_id = p_owner and b.blocked_id = v_uid)
  ) then raise exception 'Blocked'; end if;

  select created_at into v_created from public.notes where user_id = p_owner and expires_at > now();
  if v_created is null then raise exception 'No active note'; end if;

  insert into public.note_reactions (note_owner_id, reactor_id, emoji, note_created_at)
  values (p_owner, v_uid, p_emoji, v_created)
  on conflict (note_owner_id, reactor_id)
  do update set emoji = excluded.emoji, note_created_at = excluded.note_created_at;
end $function$;

-- 2. Hype: a star on someone's page. One per person per page, silent — no
--    notification, no DM — and seen only by the page's owner (and the person
--    who gave it). Kept apart from reactions so you can both hype a page and
--    react to it.
create table if not exists public.note_hypes (
  note_owner_id uuid not null references public.profiles(id) on delete cascade,
  hyper_id uuid not null references public.profiles(id) on delete cascade,
  note_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (note_owner_id, hyper_id)
);
alter table public.note_hypes enable row level security;

drop policy if exists note_hypes_owner_select on public.note_hypes;
create policy note_hypes_owner_select on public.note_hypes
  for select using ((select auth.uid()) = note_owner_id);
drop policy if exists note_hypes_hyper_select on public.note_hypes;
create policy note_hypes_hyper_select on public.note_hypes
  for select using ((select auth.uid()) = hyper_id);

-- Writes only through toggle_note_hype, which checks the page is live and
-- that the two of you are not blocking each other.
revoke all on public.note_hypes from anon, authenticated;
grant select on public.note_hypes to authenticated;

create or replace function public.toggle_note_hype(p_owner uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := (select auth.uid()); v_created timestamptz; v_had boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_uid = p_owner then raise exception 'Own page'; end if;
  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = v_uid and b.blocked_id = p_owner)
       or (b.blocker_id = p_owner and b.blocked_id = v_uid)
  ) then raise exception 'Blocked'; end if;

  select created_at into v_created from public.notes where user_id = p_owner and expires_at > now();
  if v_created is null then raise exception 'No active note'; end if;

  -- A hype on yesterday's page does not count for today's.
  select exists (
    select 1 from public.note_hypes
    where note_owner_id = p_owner and hyper_id = v_uid and note_created_at = v_created
  ) into v_had;

  if v_had then
    delete from public.note_hypes where note_owner_id = p_owner and hyper_id = v_uid;
    return false;
  end if;
  insert into public.note_hypes (note_owner_id, hyper_id, note_created_at)
  values (p_owner, v_uid, v_created)
  on conflict (note_owner_id, hyper_id)
  do update set note_created_at = excluded.note_created_at, created_at = now();
  return true;
end $function$;

revoke all on function public.toggle_note_hype(uuid) from public, anon;
grant execute on function public.toggle_note_hype(uuid) to authenticated, service_role;

-- 3. A reply to a page — an emoji or words — as a DM that carries the page it
--    answers. The page is copied into the message (metadata.page) at the
--    moment of replying, by the server, from the live row: a page is gone
--    after a day, and the chat should still show what was being answered —
--    exactly what it said, not what a client claimed it said.
--
--    Only a page you can see (the same rules as get_notes) can be replied
--    to, and get_or_create_dm keeps its own rules about who may start a chat.
--    No notification: the message is the news.
create or replace function public.send_page_reply(p_owner uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := (select auth.uid());
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_note public.notes;
  v_hue integer;
  v_conv uuid;
  v_msg uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if v_me = p_owner then raise exception 'Own page'; end if;
  if v_body is null then raise exception 'Empty message'; end if;
  if char_length(v_body) > 500 then raise exception 'Too long'; end if;

  select * into v_note from public.notes where user_id = p_owner and expires_at > now();
  if not found then raise exception 'No active note'; end if;
  if not exists (select 1 from public.get_notes() g where g.user_id = p_owner) then
    raise exception 'Not visible';
  end if;

  v_conv := public.get_or_create_dm(p_owner);
  select avatar_hue into v_hue from public.profiles where id = p_owner;

  insert into public.messages (conversation_id, sender_id, body, kind, metadata)
  values (
    v_conv, v_me, v_body, 'page_reply',
    jsonb_build_object('page', jsonb_build_object(
      'owner_id', p_owner,
      'text', v_note.text,
      'color', v_note.color,
      'hue', coalesce(v_hue, 280),
      'written_at', v_note.created_at,
      'track', case when v_note.track is null then null else jsonb_build_object(
        'title', v_note.track->>'title',
        'artist', v_note.track->>'artist',
        'artwork', v_note.track->>'artwork'
      ) end
    ))
  )
  returning id into v_msg;

  update public.conversations
    set last_message_at = now(), last_message_id = v_msg, updated_at = now()
    where id = v_conv;

  return v_conv;
end $function$;

revoke all on function public.send_page_reply(uuid, text) from public, anon;
grant execute on function public.send_page_reply(uuid, text) to authenticated, service_role;
