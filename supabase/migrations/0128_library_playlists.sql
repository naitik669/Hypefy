-- Library: playlists that hold sounds too, and can be shared.
--
-- "Saved" becomes Library and a "folder" becomes a playlist. The tables keep
-- their names (collections, collection_items); what changes is what they can
-- hold and who can reach them.
--
--   1. A playlist item can be a sound, as well as a post or a Shot. A sound
--      is stored whole, as it is everywhere else.
--   2. A playlist can have members. Its owner invites people they follow who
--      follow them back; an invitation has to be accepted. A member can add
--      and remove things and change the playlist's name and look. Only the
--      owner can delete it, or invite and remove people.
--
-- A shared playlist shows each person only what they could see anyway: a post
-- from a private account is in the playlist for those who follow it, and
-- simply absent for those who do not.

-- ── 1. Sounds as items, and who added what ─────────────────────────────

alter table public.collection_items
  add column if not exists track_id text,
  add column if not exists track jsonb,
  add column if not exists added_by uuid references public.profiles(id) on delete set null;

-- The old rule was "a post or a Shot", under whatever name it was given.
do $
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'public.collection_items'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%num_nonnulls%' loop
    execute format('alter table public.collection_items drop constraint %I', r.conname);
  end loop;
end $;
alter table public.collection_items
  add constraint collection_items_one_thing check (num_nonnulls(post_id, shot_id, track_id) = 1);
alter table public.collection_items drop constraint if exists collection_items_track_shape;
alter table public.collection_items
  add constraint collection_items_track_shape check (
    (track_id is null and track is null)
    or (track is not null and length(track_id) between 1 and 128
        and track->>'id' = track_id and pg_column_size(track) < 4000)
  );
create unique index if not exists collection_items_collection_track_key
  on public.collection_items (collection_id, track_id) where track_id is not null;

-- ── 2. Members ─────────────────────────────────────────────────────────

create table if not exists public.collection_members (
  collection_id uuid not null references public.collections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (collection_id, user_id)
);
create index if not exists collection_members_user_idx on public.collection_members (user_id, status);
alter table public.collection_members enable row level security;
revoke all on public.collection_members from anon, authenticated;
grant select on public.collection_members to authenticated;

-- What the person asking is to a playlist: 'owner', 'editor' (a member who
-- accepted), 'invited', or null. SECURITY DEFINER so the policies below can
-- ask without reading each other in a circle.
create or replace function public.collection_role(p_collection uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.collections c
                  where c.id = p_collection and c.user_id = (select auth.uid())) then 'owner'
    else (select case m.status when 'joined' then 'editor' else 'invited' end
            from public.collection_members m
           where m.collection_id = p_collection and m.user_id = (select auth.uid()))
  end;
$$;
revoke all on function public.collection_role(uuid) from public, anon;
grant execute on function public.collection_role(uuid) to authenticated;

drop policy if exists "collection_members: those involved read" on public.collection_members;
create policy "collection_members: those involved read" on public.collection_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.collection_role(collection_id) in ('owner', 'editor'));

-- ── 3. Who can reach a playlist ────────────────────────────────────────

drop policy if exists collections_owner_all on public.collections;
drop policy if exists "collections: owner and members read" on public.collections;
create policy "collections: owner and members read" on public.collections
  for select to authenticated
  using ((select auth.uid()) = user_id or public.collection_role(id) in ('editor', 'invited'));
drop policy if exists "collections: owner makes" on public.collections;
create policy "collections: owner makes" on public.collections
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "collections: owner and editors change" on public.collections;
create policy "collections: owner and editors change" on public.collections
  for update to authenticated
  using ((select auth.uid()) = user_id or public.collection_role(id) = 'editor')
  with check ((select auth.uid()) = user_id or public.collection_role(id) = 'editor');
drop policy if exists "collections: owner deletes" on public.collections;
create policy "collections: owner deletes" on public.collections
  for delete to authenticated using ((select auth.uid()) = user_id);

-- A member may rename and restyle a playlist. They may not take it, or move
-- it about on its owner's shelf.
create or replace function public.collections_guard_owner_fields()
returns trigger language plpgsql as $$
begin
  if (select auth.uid()) is not null and (select auth.uid()) <> old.user_id then
    new.user_id := old.user_id;
    new.position := old.position;
  end if;
  return new;
end $$;
drop trigger if exists collections_guard_owner_fields on public.collections;
create trigger collections_guard_owner_fields before update on public.collections
  for each row execute function public.collections_guard_owner_fields();

drop policy if exists collection_items_owner_all on public.collection_items;
drop policy if exists "collection_items: owner and editors" on public.collection_items;
create policy "collection_items: owner and editors" on public.collection_items
  for all to authenticated
  using (public.collection_role(collection_id) in ('owner', 'editor'))
  with check (public.collection_role(collection_id) in ('owner', 'editor'));

-- Who added it, filled in for them.
create or replace function public.collection_items_stamp()
returns trigger language plpgsql as $$
begin
  if new.added_by is null then new.added_by := (select auth.uid()); end if;
  return new;
end $$;
drop trigger if exists collection_items_stamp on public.collection_items;
create trigger collection_items_stamp before insert on public.collection_items
  for each row execute function public.collection_items_stamp();

-- Adding something to a playlist keeps it in the Library of whoever added
-- it. It used to keep it for the playlist's owner, which was the same person
-- until a playlist could be shared.
create or replace function public.folder_item_saves()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_who uuid := coalesce(new.added_by, (select auth.uid()));
begin
  if v_who is null then
    select user_id into v_who from public.collections where id = new.collection_id;
  end if;
  if new.post_id is not null then
    insert into public.saved_posts (user_id, post_id) values (v_who, new.post_id)
    on conflict (user_id, post_id) do nothing;
  elsif new.shot_id is not null then
    insert into public.saved_shots (user_id, shot_id) values (v_who, new.shot_id)
    on conflict (user_id, shot_id) do nothing;
  else
    insert into public.saved_sounds (user_id, track_id, track) values (v_who, new.track_id, new.track - 'start')
    on conflict (user_id, track_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.folder_item_saves() from public, anon, authenticated;

-- ── 4. Filing a post, Shot or sound into playlists ─────────────────────

create or replace function public.set_item_folders(
  p_post uuid default null, p_shot uuid default null, p_folders uuid[] default '{}'
) returns void language plpgsql set search_path = public as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if num_nonnulls(p_post, p_shot) <> 1 then raise exception 'One post or one Shot'; end if;

  if coalesce(array_length(p_folders, 1), 0) > 0 then
    if p_post is not null then
      insert into public.saved_posts (user_id, post_id) values (v_uid, p_post)
      on conflict (user_id, post_id) do nothing;
    else
      insert into public.saved_shots (user_id, shot_id) values (v_uid, p_shot)
      on conflict (user_id, shot_id) do nothing;
    end if;
  end if;

  -- Every playlist this person can change: their own, and ones they joined.
  delete from public.collection_items ci
   where (ci.post_id = p_post or ci.shot_id = p_shot)
     and public.collection_role(ci.collection_id) in ('owner', 'editor')
     and not (ci.collection_id = any (coalesce(p_folders, '{}')));

  insert into public.collection_items (collection_id, post_id, shot_id)
  select f, p_post, p_shot
    from unnest(coalesce(p_folders, '{}')) as f
   where public.collection_role(f) in ('owner', 'editor')
  on conflict do nothing;
end $$;

create or replace function public.set_sound_playlists(p_track jsonb, p_folders uuid[] default '{}')
returns void language plpgsql set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_id text := p_track->>'id';
  v_track jsonb := p_track - 'start';
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if coalesce(v_id, '') = '' or coalesce(v_track->>'title', '') = '' then raise exception 'Not a sound'; end if;

  if coalesce(array_length(p_folders, 1), 0) > 0 then
    insert into public.saved_sounds (user_id, track_id, track) values (v_uid, v_id, v_track)
    on conflict (user_id, track_id) do nothing;
  end if;

  delete from public.collection_items ci
   where ci.track_id = v_id
     and public.collection_role(ci.collection_id) in ('owner', 'editor')
     and not (ci.collection_id = any (coalesce(p_folders, '{}')));

  insert into public.collection_items (collection_id, track_id, track)
  select f, v_id, v_track
    from unnest(coalesce(p_folders, '{}')) as f
   where public.collection_role(f) in ('owner', 'editor')
  on conflict do nothing;
end $$;
revoke all on function public.set_sound_playlists(jsonb, uuid[]) from public, anon;
grant execute on function public.set_sound_playlists(jsonb, uuid[]) to authenticated;

-- ── 5. The shelf: your playlists, then the ones you joined ─────────────

drop function if exists public.get_folders();
create function public.get_folders()
returns table (
  id uuid, name text, emoji text, color text, "position" integer, cover_url text,
  created_at timestamptz, item_count bigint, covers jsonb,
  owner_id uuid, is_owner boolean, member_count integer, owner_username text
)
language sql stable set search_path = public as $$
  select c.id, c.name, c.emoji, c.color, c.position, c.cover_url, c.created_at,
         (select count(*) from public.collection_items ci where ci.collection_id = c.id),
         coalesce((
           select jsonb_agg(x.cover order by x.at desc)
             from (
               select ci.created_at as at,
                      case
                        when ci.post_id is not null
                          then jsonb_build_object('kind', 'post', 'thumb', coalesce(p.image_urls[1], p.image_url))
                        when ci.shot_id is not null
                          then jsonb_build_object('kind', 'shot', 'thumb', s.poster_url, 'video', s.media_url)
                        else jsonb_build_object('kind', 'sound', 'thumb', ci.track->>'artwork')
                      end as cover
                 from public.collection_items ci
                 left join public.posts p on p.id = ci.post_id
                 left join public.shots s on s.id = ci.shot_id
                where ci.collection_id = c.id
                order by ci.created_at desc
                limit 4
             ) x
         ), '[]'::jsonb),
         c.user_id,
         c.user_id = (select auth.uid()),
         (select count(*)::int from public.collection_members m
           where m.collection_id = c.id and m.status = 'joined'),
         (select pr.username from public.profiles pr where pr.id = c.user_id)
    from public.collections c
   where c.user_id = (select auth.uid())
      or exists (select 1 from public.collection_members m
                  where m.collection_id = c.id and m.user_id = (select auth.uid()) and m.status = 'joined')
   -- Your own first, in the order you arranged them; then shared ones.
   order by (c.user_id = (select auth.uid())) desc, c.position, c.created_at;
$$;
revoke all on function public.get_folders() from public, anon;
grant execute on function public.get_folders() to authenticated;

-- ── 6. Inviting, answering, leaving ────────────────────────────────────

-- The most people a playlist can have besides its owner.
create or replace function public.playlist_member_cap() returns int language sql immutable as $$ select 20 $$;

create or replace function public.playlist_invite_candidates(p_collection uuid)
returns table (id uuid, name text, username text, avatar_hue int, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.username, p.avatar_hue, p.avatar_url
    from public.follows f
    join public.follows b on b.follower_id = f.following_id and b.following_id = f.follower_id
    join public.profiles p on p.id = f.following_id
   where f.follower_id = (select auth.uid())
     and exists (select 1 from public.collections c where c.id = p_collection and c.user_id = (select auth.uid()))
     and not exists (select 1 from public.collection_members m
                      where m.collection_id = p_collection and m.user_id = p.id)
     and not exists (select 1 from public.blocked_users bl
                      where (bl.blocker_id = p.id and bl.blocked_id = (select auth.uid()))
                         or (bl.blocker_id = (select auth.uid()) and bl.blocked_id = p.id))
   order by p.display_name nulls last
   limit 200;
$$;

create or replace function public.invite_to_playlist(p_collection uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_name text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select name into v_name from public.collections where id = p_collection and user_id = v_uid;
  if v_name is null then raise exception 'Only the playlist''s owner can invite'; end if;
  if not exists (select 1 from public.playlist_invite_candidates(p_collection) c where c.id = p_user) then
    raise exception 'You can invite people you follow who follow you back';
  end if;
  if (select count(*) from public.collection_members where collection_id = p_collection) >= public.playlist_member_cap() then
    raise exception 'This playlist is full';
  end if;
  insert into public.collection_members (collection_id, user_id, status, invited_by)
  values (p_collection, p_user, 'invited', v_uid);
  insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
  values (p_user, v_uid, 'playlist_invite', 'playlist', p_collection,
          'invited you to the playlist ' || v_name);
end $$;

create or replace function public.respond_playlist_invite(p_collection uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_accept then
    update public.collection_members set status = 'joined', joined_at = now()
     where collection_id = p_collection and user_id = v_uid and status = 'invited';
    if not found then raise exception 'That invitation is gone'; end if;
  else
    delete from public.collection_members
     where collection_id = p_collection and user_id = v_uid and status = 'invited';
  end if;
  delete from public.notifications
   where user_id = v_uid and type = 'playlist_invite' and target_id = p_collection;
end $$;

-- A member leaves; or the owner removes a member, or takes back an invitation.
create or replace function public.remove_playlist_member(p_collection uuid, p_user uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_target uuid := coalesce(p_user, auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_target <> v_uid and not exists (
       select 1 from public.collections where id = p_collection and user_id = v_uid) then
    raise exception 'Only the playlist''s owner can remove people';
  end if;
  delete from public.collection_members where collection_id = p_collection and user_id = v_target;
  delete from public.notifications
   where user_id = v_target and type = 'playlist_invite' and target_id = p_collection;
end $$;

create or replace function public.playlist_members(p_collection uuid)
returns table (id uuid, name text, username text, avatar_hue int, avatar_url text, status text, is_owner boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.username, p.avatar_hue, p.avatar_url, 'joined', true
    from public.collections c join public.profiles p on p.id = c.user_id
   where c.id = p_collection and public.collection_role(p_collection) in ('owner', 'editor', 'invited')
  union all
  select p.id, p.display_name, p.username, p.avatar_hue, p.avatar_url, m.status, false
    from public.collection_members m join public.profiles p on p.id = m.user_id
   where m.collection_id = p_collection
     and public.collection_role(p_collection) in ('owner', 'editor')
     -- Pending invitations are the owner's business.
     and (m.status = 'joined' or public.collection_role(p_collection) = 'owner');
$$;

create or replace function public.my_playlist_invites()
returns table (collection_id uuid, name text, emoji text, color text, item_count bigint,
               owner_name text, owner_username text, owner_hue int, owner_avatar text, invited_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.emoji, c.color,
         (select count(*) from public.collection_items ci where ci.collection_id = c.id),
         p.display_name, p.username, p.avatar_hue, p.avatar_url, m.created_at
    from public.collection_members m
    join public.collections c on c.id = m.collection_id
    join public.profiles p on p.id = c.user_id
   where m.user_id = (select auth.uid()) and m.status = 'invited'
   order by m.created_at desc;
$$;

revoke all on function public.playlist_invite_candidates(uuid), public.invite_to_playlist(uuid, uuid),
  public.respond_playlist_invite(uuid, boolean), public.remove_playlist_member(uuid, uuid),
  public.playlist_members(uuid), public.my_playlist_invites() from public, anon;
grant execute on function public.playlist_invite_candidates(uuid), public.invite_to_playlist(uuid, uuid),
  public.respond_playlist_invite(uuid, boolean), public.remove_playlist_member(uuid, uuid),
  public.playlist_members(uuid), public.my_playlist_invites() to authenticated;
