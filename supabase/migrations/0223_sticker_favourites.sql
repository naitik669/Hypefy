-- Sticker favourites, and the rule for which stickers somebody can reach.
--
-- The drawer's rail (27 Nov design, "Packs & the drawer rail") has three
-- fixed shelves before the packs: Recent, Favourites, Yours. Recent comes
-- from your own sticker messages and Yours from public.stickers; this adds
-- the third.
--
-- A favourite can be somebody else's sticker — the one a friend keeps
-- sending you is the obvious thing to star. 0220 lets you read only your
-- own rows in public.stickers, and that stays: opening the table up would
-- let anyone list every sticker every person has made. Instead the reads
-- and writes go through functions that check, one sticker at a time,
-- whether you could already have seen it.
--
-- can_see_sticker() is that check, and the packs migration extends it:
--   - it is yours, or
--   - it was sent in a conversation you are in (not unsent, not removed), or
--   - it is already one of your favourites.
-- It is the one gate both favourites and packs go through, so "which
-- stickers can I reach" has one answer rather than one per feature.

create table if not exists public.sticker_favourites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  sticker_id uuid not null references public.stickers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, sticker_id)
);

create index if not exists sticker_favourites_user_idx
  on public.sticker_favourites (user_id, created_at desc);

-- RLS on, and no grants: nobody reads or writes this table directly. The
-- functions below are the only way in, so the check above cannot be
-- stepped around with a plain insert.
alter table public.sticker_favourites enable row level security;
revoke all on table public.sticker_favourites from public, anon, authenticated;

-- "Was this sticker sent in a conversation I am in?" is asked by sticker
-- id, out of the metadata send_sticker writes. Partial, so it costs only
-- the sticker messages.
create index if not exists messages_sticker_id_idx
  on public.messages ((metadata->>'sticker_id'))
  where kind = 'sticker';

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
       )
  );
$$;

revoke all on function public.can_see_sticker(uuid) from public, anon;
grant execute on function public.can_see_sticker(uuid) to authenticated;

-- Star or unstar one. Unstarring needs no check: it only ever removes
-- your own row. Starring is capped so the shelf stays a shelf.
create or replace function public.set_sticker_favourite(p_sticker_id uuid, p_on boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not coalesce(p_on, false) then
    delete from public.sticker_favourites where user_id = v_me and sticker_id = p_sticker_id;
    return false;
  end if;
  if not public.can_see_sticker(p_sticker_id) then raise exception 'No such sticker'; end if;
  if exists (select 1 from public.sticker_favourites where user_id = v_me and sticker_id = p_sticker_id) then
    return true;
  end if;
  if (select count(*) from public.sticker_favourites where user_id = v_me) >= 200 then
    raise exception 'You have 200 favourites already. Take one out first.';
  end if;
  insert into public.sticker_favourites (user_id, sticker_id) values (v_me, p_sticker_id);
  return true;
end $$;

revoke all on function public.set_sticker_favourite(uuid, boolean) from public, anon;
grant execute on function public.set_sticker_favourite(uuid, boolean) to authenticated;

-- Your favourites, newest first, in the shape the drawer draws. A sticker
-- its maker has since deleted drops off the shelf rather than showing a
-- picture that can no longer be sent.
create or replace function public.my_favourite_stickers()
returns table (id uuid, path text, edge text, width int, height int)
language sql stable security definer set search_path = public as $$
  select s.id, s.path, s.edge, s.width, s.height
    from public.sticker_favourites f
    join public.stickers s on s.id = f.sticker_id and s.deleted_at is null
   where f.user_id = (select auth.uid())
   order by f.created_at desc
   limit 200;
$$;

revoke all on function public.my_favourite_stickers() from public, anon;
grant execute on function public.my_favourite_stickers() to authenticated;
