-- Sticker packs (T3), from the 27 Nov design "Packs & the drawer rail".
--
-- A pack is a named set of 2 to 30 stickers that already exist. It is made
-- only from stickers its maker can already reach — can_see_sticker() from
-- 0223 — so there is no new picture inside the pack flow, and a pack can
-- never be a way to reach a sticker you could not reach before. A sticker
-- can be in several packs; taking one out of a pack never deletes it.
--
-- Every pack has a code: 8 characters from an alphabet with no 0/O/1/I, so
-- it survives being read aloud or typed off a screenshot. The card in a
-- chat, the link app.hypefy.chat/stickers/p/<code>, the typed code and the
-- QR all carry the same code. Pictures stay in the public bucket (settled
-- 26 Nov); what this migration guards is the pack: who can open it, who
-- can add it to their rail, who can change it.
--
-- Who can open a pack is chosen once, when it is made:
--
--   link    anyone with the code, signed in or not
--   people  only its maker and the people it was sent to
--
-- "Sent to" is a row in sticker_pack_grants, and the only thing that writes
-- one is send_sticker_pack(), run by the pack's maker into a conversation
-- they are in: every other member at that moment gets a grant. Nothing
-- else does — not knowing the code, not a link, not a scan. A person who
-- arrives cold from a QR or a pasted link for a "people" pack is told the
-- pack does not exist, exactly as for a code that was never issued, and a
-- signed-out visitor cannot hold a grant at all. That is decided here, in
-- the database, so the QR screen and the link page cannot get it wrong.
--
-- None of the four tables is granted to anon or authenticated. Every read
-- and write goes through the functions below, each of which checks who is
-- asking. RLS is on regardless, so a later grant cannot open a table by
-- accident.

create table if not exists public.sticker_packs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  -- A pack has a name although a sticker does not: it is what people see
  -- before they add it.
  name text not null check (char_length(btrim(name)) between 1 and 40),
  code text not null unique check (code ~ '^[2-9A-HJ-NP-Z]{8}$'),
  audience text not null default 'link' check (audience in ('link', 'people')),
  -- The sticker drawn in front of the cover. Null, or one no longer in the
  -- pack, means the first one in.
  cover_sticker_id uuid references public.stickers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft: a deleted pack leaves everyone's rail at once, and the cards
  -- already sent say it has gone rather than pointing at nothing.
  deleted_at timestamptz
);

create index if not exists sticker_packs_owner_idx
  on public.sticker_packs (owner_id, created_at)
  where deleted_at is null;

create table if not exists public.sticker_pack_items (
  pack_id uuid not null references public.sticker_packs(id) on delete cascade,
  sticker_id uuid not null references public.stickers(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (pack_id, sticker_id)
);

create index if not exists sticker_pack_items_sticker_idx
  on public.sticker_pack_items (sticker_id);

-- Someone else's pack on your rail.
create table if not exists public.sticker_pack_saves (
  user_id uuid not null references public.profiles(id) on delete cascade,
  pack_id uuid not null references public.sticker_packs(id) on delete cascade,
  added_at timestamptz not null default now(),
  -- Null until you first open it: the rail marks a new cover with a dot.
  seen_at timestamptz,
  primary key (user_id, pack_id)
);

create index if not exists sticker_pack_saves_pack_idx
  on public.sticker_pack_saves (pack_id);

-- Who a "people" pack was sent to.
create table if not exists public.sticker_pack_grants (
  pack_id uuid not null references public.sticker_packs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pack_id, user_id)
);

alter table public.sticker_packs enable row level security;
alter table public.sticker_pack_items enable row level security;
alter table public.sticker_pack_saves enable row level security;
alter table public.sticker_pack_grants enable row level security;
revoke all on table public.sticker_packs, public.sticker_pack_items,
  public.sticker_pack_saves, public.sticker_pack_grants from public, anon, authenticated;

-- A pack can be reported like a post or a profile.
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post', 'comment', 'message', 'profile', 'shot', 'show', 'conversation', 'sticker_pack'));

-- ── Who can open a pack ─────────────────────────────────────────────────
-- Not deleted, and: you made it, or it is a link pack, or it was sent to
-- you. Works signed out, where only the link rule can be true.
create or replace function public.can_open_sticker_pack(p_pack_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sticker_packs p
     where p.id = p_pack_id
       and p.deleted_at is null
       and (
         p.audience = 'link'
         or ((select auth.uid()) is not null and p.owner_id = (select auth.uid()))
         or exists (
           select 1 from public.sticker_pack_grants g
            where g.pack_id = p.id and g.user_id = (select auth.uid())
         )
       )
  );
$$;

revoke all on function public.can_open_sticker_pack(uuid) from public;
grant execute on function public.can_open_sticker_pack(uuid) to anon, authenticated;

-- ── Which stickers you can reach, now with packs ────────────────────────
-- 0223's three rules, plus: it is in a pack on your rail (one you made or
-- one you added). Only the rail counts — merely being able to open a pack
-- does not make its stickers yours to put in a pack of your own until you
-- have added it.
create or replace function public.can_see_sticker(p_sticker_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.stickers s
     where s.id = p_sticker_id
       and s.deleted_at is null
       and (
         s.owner_id = (select auth.uid())
         or exists (
           select 1 from public.sticker_favourites f
            where f.user_id = (select auth.uid()) and f.sticker_id = s.id
         )
         or exists (
           select 1 from public.messages m
             join public.conversation_members cm
               on cm.conversation_id = m.conversation_id
              and cm.user_id = (select auth.uid())
            where m.kind = 'sticker'
              and (m.metadata->>'sticker_id') = s.id::text
              and m.is_unsent = false
              and m.removed_at is null
         )
         or exists (
           select 1 from public.sticker_pack_items i
             join public.sticker_packs p on p.id = i.pack_id and p.deleted_at is null
            where i.sticker_id = s.id
              and (
                p.owner_id = (select auth.uid())
                or exists (
                  select 1 from public.sticker_pack_saves v
                   where v.pack_id = p.id and v.user_id = (select auth.uid())
                )
              )
         )
       )
  );
$$;

revoke all on function public.can_see_sticker(uuid) from public, anon;
grant execute on function public.can_see_sticker(uuid) to authenticated;

-- ── How a pack is read ──────────────────────────────────────────────────
-- One shape for every reader: the rail, the pack sheet, the link page.
-- `mine` and `saved` are about whoever is asking, worked out here at read
-- time. A card in a chat never stores them, because the same card is read
-- by its sender and by everybody it was sent to.
create or replace function public.sticker_pack_json(p_pack_id uuid)
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id,
    'name', p.name,
    'code', p.code,
    'audience', p.audience,
    'cover_sticker_id', p.cover_sticker_id,
    'created_at', p.created_at,
    'owner', json_build_object('id', o.id, 'username', o.username, 'display_name', o.display_name),
    'mine', (select auth.uid()) is not null and p.owner_id = (select auth.uid()),
    'saved', exists (
      select 1 from public.sticker_pack_saves v where v.pack_id = p.id and v.user_id = (select auth.uid())
    ),
    'fresh', exists (
      select 1 from public.sticker_pack_saves v
       where v.pack_id = p.id and v.user_id = (select auth.uid()) and v.seen_at is null
    ),
    'stickers', coalesce((
      select json_agg(json_build_object('id', s.id, 'path', s.path, 'edge', s.edge, 'width', s.width, 'height', s.height)
                      order by i.added_at, s.id)
        from public.sticker_pack_items i
        join public.stickers s on s.id = i.sticker_id and s.deleted_at is null
       where i.pack_id = p.id
    ), '[]'::json)
  )
  from public.sticker_packs p
  join public.profiles o on o.id = p.owner_id
  where p.id = p_pack_id;
$$;

-- Internal: it does not check who may open the pack. Only the functions
-- below call it, after checking.
revoke all on function public.sticker_pack_json(uuid) from public, anon, authenticated;

-- Your rail: the packs you made, then the ones you added, oldest first so
-- a cover keeps its place. A pack you added that has since been deleted
-- is gone from it. A save row exists only for a pack you could open when
-- you added it, and neither a pack's audience nor a grant is ever taken
-- back, so the save is enough.
create or replace function public.my_sticker_packs()
returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(public.sticker_pack_json(x.id) order by x.ord, x.at, x.id), '[]'::json)
    from (
      select p.id, 0 as ord, p.created_at as at
        from public.sticker_packs p
       where p.owner_id = (select auth.uid()) and p.deleted_at is null
      union all
      select p.id, 1, v.added_at
        from public.sticker_pack_saves v
        join public.sticker_packs p on p.id = v.pack_id and p.deleted_at is null
       where v.user_id = (select auth.uid())
         and p.owner_id <> v.user_id
    ) x;
$$;

revoke all on function public.my_sticker_packs() from public, anon;
grant execute on function public.my_sticker_packs() to authenticated;

-- A pack by its code, for the link page, the typed code, the QR and the
-- card. Null for a code nobody issued, a deleted pack, and a "people" pack
-- you were not sent — all three look the same from outside. Signed out
-- works, for link packs only.
create or replace function public.sticker_pack_by_code(p_code text)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from public.sticker_packs
   where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_id is null or not public.can_open_sticker_pack(v_id) then return null; end if;
  return public.sticker_pack_json(v_id);
end $$;

revoke all on function public.sticker_pack_by_code(text) from public;
grant execute on function public.sticker_pack_by_code(text) to anon, authenticated;

-- ── Making and changing your own ────────────────────────────────────────

-- 8 characters, 5 bits each, out of a v4 uuid's random bytes (bytes 6 and
-- 8 carry the version and variant, so they are skipped). 32 divides 256,
-- so every character is equally likely.
create or replace function public.new_sticker_pack_code()
returns text
language plpgsql volatile set search_path = public as $$
declare
  v_alpha constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea;
  v_code text;
  v_i int;
begin
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    foreach v_i in array array[0, 1, 2, 3, 4, 5, 9, 10] loop
      v_code := v_code || substr(v_alpha, (get_byte(v_bytes, v_i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.sticker_packs where code = v_code);
  end loop;
  return v_code;
end $$;

revoke all on function public.new_sticker_pack_code() from public, anon, authenticated;

-- The stickers asked for, once each, in the order asked, or an error that
-- says what is wrong. Shared by making a pack and adding to one.
create or replace function public.check_pack_stickers(p_sticker_ids uuid[])
returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_out uuid[] := '{}';
  v_id uuid;
begin
  foreach v_id in array coalesce(p_sticker_ids, '{}') loop
    if v_id = any(v_out) then continue; end if;
    if not public.can_see_sticker(v_id) then raise exception 'No such sticker'; end if;
    v_out := v_out || v_id;
  end loop;
  return v_out;
end $$;

revoke all on function public.check_pack_stickers(uuid[]) from public, anon, authenticated;

create or replace function public.create_sticker_pack(
  p_name text,
  p_audience text,
  p_sticker_ids uuid[],
  p_cover_sticker_id uuid default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
  v_ids uuid[];
  v_pack public.sticker_packs%rowtype;
  v_i int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception 'A pack needs a name, up to 40 characters.';
  end if;
  if coalesce(p_audience, '') not in ('link', 'people') then raise exception 'Who can add it?'; end if;
  v_ids := public.check_pack_stickers(p_sticker_ids);
  if cardinality(v_ids) not between 2 and 30 then
    raise exception 'A pack has 2 to 30 stickers.';
  end if;
  if p_cover_sticker_id is not null and not (p_cover_sticker_id = any(v_ids)) then
    raise exception 'The cover has to be one of the pack''s stickers.';
  end if;
  if (select count(*) from public.sticker_packs where owner_id = v_me and deleted_at is null) >= 50 then
    raise exception 'You have 50 packs already. Delete one first.';
  end if;
  perform public.rate_limit('sticker_pack_create', 20, interval '1 hour');

  insert into public.sticker_packs (owner_id, name, code, audience, cover_sticker_id)
  values (v_me, btrim(p_name), public.new_sticker_pack_code(), p_audience, p_cover_sticker_id)
  returning * into v_pack;

  -- One microsecond apart, so the order picked is the order kept.
  for v_i in 1 .. cardinality(v_ids) loop
    insert into public.sticker_pack_items (pack_id, sticker_id, added_at)
    values (v_pack.id, v_ids[v_i], now() + make_interval(secs => v_i / 1000000.0));
  end loop;

  return public.sticker_pack_json(v_pack.id);
end $$;

revoke all on function public.create_sticker_pack(text, text, uuid[], uuid) from public, anon;
grant execute on function public.create_sticker_pack(text, text, uuid[], uuid) to authenticated;

-- The pack, if it is yours and still there; otherwise an error. Locks the
-- row so two changes at once cannot both pass the size check.
create or replace function public.own_sticker_pack(p_pack_id uuid)
returns public.sticker_packs
language plpgsql volatile security definer set search_path = public as $$
declare
  v_pack public.sticker_packs%rowtype;
begin
  select * into v_pack from public.sticker_packs
   where id = p_pack_id and deleted_at is null and owner_id = (select auth.uid())
   for update;
  if v_pack.id is null then raise exception 'No such pack'; end if;
  return v_pack;
end $$;

revoke all on function public.own_sticker_pack(uuid) from public, anon, authenticated;

create or replace function public.rename_sticker_pack(p_pack_id uuid, p_name text)
returns json
language plpgsql security definer set search_path = public as $$
begin
  perform public.own_sticker_pack(p_pack_id);
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception 'A pack needs a name, up to 40 characters.';
  end if;
  update public.sticker_packs set name = btrim(p_name), updated_at = now() where id = p_pack_id;
  return public.sticker_pack_json(p_pack_id);
end $$;

revoke all on function public.rename_sticker_pack(uuid, text) from public, anon;
grant execute on function public.rename_sticker_pack(uuid, text) to authenticated;

-- Deleting takes it out of everyone's rail. The stickers stay.
create or replace function public.delete_sticker_pack(p_pack_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.own_sticker_pack(p_pack_id);
  update public.sticker_packs set deleted_at = now(), updated_at = now() where id = p_pack_id;
end $$;

revoke all on function public.delete_sticker_pack(uuid) from public, anon;
grant execute on function public.delete_sticker_pack(uuid) to authenticated;

create or replace function public.add_stickers_to_pack(p_pack_id uuid, p_sticker_ids uuid[])
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_new uuid[];
  v_i int;
begin
  perform public.own_sticker_pack(p_pack_id);
  v_ids := public.check_pack_stickers(p_sticker_ids);
  select coalesce(array_agg(x order by o), '{}') into v_new
    from unnest(v_ids) with ordinality as t(x, o)
   where not exists (select 1 from public.sticker_pack_items i where i.pack_id = p_pack_id and i.sticker_id = t.x);
  if (select count(*) from public.sticker_pack_items where pack_id = p_pack_id) + cardinality(v_new) > 30 then
    raise exception 'A pack has 2 to 30 stickers.';
  end if;
  for v_i in 1 .. cardinality(v_new) loop
    insert into public.sticker_pack_items (pack_id, sticker_id, added_at)
    values (p_pack_id, v_new[v_i], now() + make_interval(secs => v_i / 1000000.0));
  end loop;
  update public.sticker_packs set updated_at = now() where id = p_pack_id;
  return public.sticker_pack_json(p_pack_id);
end $$;

revoke all on function public.add_stickers_to_pack(uuid, uuid[]) from public, anon;
grant execute on function public.add_stickers_to_pack(uuid, uuid[]) to authenticated;

-- Taking one out never deletes the sticker: it stays in Yours, in its
-- maker's stickers, and in any other pack it is in.
create or replace function public.remove_sticker_from_pack(p_pack_id uuid, p_sticker_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
begin
  perform public.own_sticker_pack(p_pack_id);
  if not exists (select 1 from public.sticker_pack_items where pack_id = p_pack_id and sticker_id = p_sticker_id) then
    raise exception 'That sticker is not in this pack.';
  end if;
  if (select count(*) from public.sticker_pack_items where pack_id = p_pack_id) <= 2 then
    raise exception 'A pack has 2 to 30 stickers.';
  end if;
  delete from public.sticker_pack_items where pack_id = p_pack_id and sticker_id = p_sticker_id;
  update public.sticker_packs
     set updated_at = now(),
         cover_sticker_id = case when cover_sticker_id = p_sticker_id then null else cover_sticker_id end
   where id = p_pack_id;
  return public.sticker_pack_json(p_pack_id);
end $$;

revoke all on function public.remove_sticker_from_pack(uuid, uuid) from public, anon;
grant execute on function public.remove_sticker_from_pack(uuid, uuid) to authenticated;

-- ── Someone else's pack on your rail ────────────────────────────────────
-- By code, because the code is what every road carries. The one write a
-- recipient makes: a row saying "this pack is on my rail", for a pack they
-- can open. It changes nothing about the pack.
create or replace function public.save_sticker_pack(p_code text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
  v_pack public.sticker_packs%rowtype;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  select * into v_pack from public.sticker_packs
   where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_pack.id is null or not public.can_open_sticker_pack(v_pack.id) then raise exception 'No such pack'; end if;
  -- Your own is on your rail already.
  if v_pack.owner_id = v_me then return public.sticker_pack_json(v_pack.id); end if;
  if not exists (select 1 from public.sticker_pack_saves where user_id = v_me and pack_id = v_pack.id) then
    if (select count(*) from public.sticker_pack_saves where user_id = v_me) >= 100 then
      raise exception 'You have 100 packs added already. Remove one first.';
    end if;
    insert into public.sticker_pack_saves (user_id, pack_id) values (v_me, v_pack.id);
  end if;
  return public.sticker_pack_json(v_pack.id);
end $$;

revoke all on function public.save_sticker_pack(text) from public, anon;
grant execute on function public.save_sticker_pack(text) to authenticated;

create or replace function public.unsave_sticker_pack(p_pack_id uuid)
returns void
language sql security definer set search_path = public as $$
  delete from public.sticker_pack_saves where user_id = (select auth.uid()) and pack_id = p_pack_id;
$$;

revoke all on function public.unsave_sticker_pack(uuid) from public, anon;
grant execute on function public.unsave_sticker_pack(uuid) to authenticated;

-- Opening an added pack clears its dot.
create or replace function public.mark_sticker_pack_seen(p_pack_id uuid)
returns void
language sql security definer set search_path = public as $$
  update public.sticker_pack_saves set seen_at = now()
   where user_id = (select auth.uid()) and pack_id = p_pack_id and seen_at is null;
$$;

revoke all on function public.mark_sticker_pack_seen(uuid) from public, anon;
grant execute on function public.mark_sticker_pack_seen(uuid) to authenticated;

-- ── Sending a pack into a chat ──────────────────────────────────────────
-- The "In Hypefy" road: the card goes as your own message. The metadata is
-- the server's to write — which pack, its code, and a snapshot of the name,
-- count and first three pictures so the card can be drawn before anything
-- is fetched. It carries nothing about who is reading it.
--
-- A link pack can be passed on by anyone who can open it. A people pack
-- only by its maker, and sending it is what lets the chat's other members
-- in: each gets a grant.
create or replace function public.send_sticker_pack(
  p_conversation_id uuid,
  p_pack_id uuid,
  p_reply_to_id uuid default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
  v_pack public.sticker_packs%rowtype;
  v_msg public.messages%rowtype;
  v_meta jsonb;
  v_prev_count int;
  v_other uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.is_conv_member(p_conversation_id) then raise exception 'Not a member'; end if;
  select * into v_pack from public.sticker_packs where id = p_pack_id and deleted_at is null;
  if v_pack.id is null or not public.can_open_sticker_pack(v_pack.id) then raise exception 'No such pack'; end if;
  if v_pack.audience = 'people' and v_pack.owner_id <> v_me then
    raise exception 'Only the person who made this pack can send it.';
  end if;

  if exists (
    select 1 from public.conversation_members cm
    join public.blocked_users b on b.blocker_id = cm.user_id and b.blocked_id = v_me
    where cm.conversation_id = p_conversation_id and cm.user_id <> v_me
  ) then
    raise exception 'blocked';
  end if;

  v_meta := jsonb_build_object(
    'pack_id', v_pack.id,
    'code', v_pack.code,
    'name', v_pack.name,
    'count', (select count(*) from public.sticker_pack_items i
                join public.stickers s on s.id = i.sticker_id and s.deleted_at is null
               where i.pack_id = v_pack.id),
    'owner_id', v_pack.owner_id,
    'cover', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'path', c.path, 'edge', c.edge, 'w', c.width, 'h', c.height) order by c.ord)
        from (
          select s.id, s.path, s.edge, s.width, s.height,
                 row_number() over (order by (s.id = v_pack.cover_sticker_id) desc, i.added_at, s.id) as ord
            from public.sticker_pack_items i
            join public.stickers s on s.id = i.sticker_id and s.deleted_at is null
           where i.pack_id = v_pack.id
        ) c
       where c.ord <= 3
    ), '[]'::jsonb)
  );

  if v_pack.audience = 'people' then
    insert into public.sticker_pack_grants (pack_id, user_id)
    select v_pack.id, cm.user_id from public.conversation_members cm
     where cm.conversation_id = p_conversation_id and cm.user_id <> v_me
    on conflict do nothing;
  end if;

  select count(*) into v_prev_count from public.messages where conversation_id = p_conversation_id;

  insert into public.messages (conversation_id, sender_id, body, kind, reply_to_id, metadata)
  values (p_conversation_id, v_me, null, 'sticker_pack', p_reply_to_id, v_meta)
  returning * into v_msg;

  update public.conversations
     set last_message_at = now(), last_message_id = v_msg.id, updated_at = now()
   where id = p_conversation_id;

  select user_id into v_other from public.conversation_members
   where conversation_id = p_conversation_id and user_id <> v_me limit 1;
  if v_other is not null and v_prev_count = 0 then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (v_other, v_me, 'new_message', 'conversation', p_conversation_id, 'sent you a message');
  end if;

  return json_build_object(
    'id', v_msg.id, 'conversation_id', v_msg.conversation_id, 'sender_id', v_msg.sender_id,
    'body', v_msg.body, 'kind', v_msg.kind, 'reply_to_id', v_msg.reply_to_id,
    'is_unsent', v_msg.is_unsent, 'metadata', v_msg.metadata, 'created_at', v_msg.created_at
  );
end $$;

revoke all on function public.send_sticker_pack(uuid, uuid, uuid) from public, anon;
grant execute on function public.send_sticker_pack(uuid, uuid, uuid) to authenticated;
