-- Saved folders, part two: order them, file many things at once, and make
-- "being in a folder means being saved" hold however a row gets in.

-- 1. Anything put in a folder is saved, even by a direct insert. set_item_folders
--    already saves first; this covers every other path. Definer so it can
--    read the folder's owner; the insert itself has already passed the
--    folder's own policy, so that owner is the person filing.
create or replace function public.folder_item_saves()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_owner uuid;
begin
  select user_id into v_owner from public.collections where id = new.collection_id;
  if new.post_id is not null then
    insert into public.saved_posts (user_id, post_id) values (v_owner, new.post_id)
    on conflict (user_id, post_id) do nothing;
  else
    insert into public.saved_shots (user_id, shot_id) values (v_owner, new.shot_id)
    on conflict (user_id, shot_id) do nothing;
  end if;
  return new;
end $function$;

revoke all on function public.folder_item_saves() from public, anon, authenticated;

drop trigger if exists collection_items_save on public.collection_items;
create trigger collection_items_save after insert on public.collection_items
  for each row execute function public.folder_item_saves();

-- 2. Your folders in this order. Ids that are not yours are ignored.
create or replace function public.reorder_folders(p_ids uuid[])
returns void
language sql
set search_path to 'public'
as $function$
  update public.collections c
     set position = array_position(p_ids, c.id) - 1
   where c.user_id = (select auth.uid())
     and c.id = any (p_ids);
$function$;

revoke all on function public.reorder_folders(uuid[]) from public, anon;
grant execute on function public.reorder_folders(uuid[]) to authenticated, service_role;

-- 3. Put these posts and Shots in a folder — and, to move them, take them out
--    of another. Runs as you, so both folders must be yours.
create or replace function public.file_items(
  p_folder uuid,
  p_posts uuid[] default '{}',
  p_shots uuid[] default '{}',
  p_from uuid default null
)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.collections where id = p_folder and user_id = v_uid) then
    raise exception 'Folder not found';
  end if;

  insert into public.collection_items (collection_id, post_id)
  select p_folder, p from unnest(coalesce(p_posts, '{}')) as p
  on conflict (collection_id, post_id) do nothing;

  insert into public.collection_items (collection_id, shot_id)
  select p_folder, s from unnest(coalesce(p_shots, '{}')) as s
  on conflict (collection_id, shot_id) do nothing;

  if p_from is not null and p_from <> p_folder then
    delete from public.collection_items ci
     using public.collections c
     where ci.collection_id = p_from
       and c.id = p_from and c.user_id = v_uid
       and (ci.post_id = any (coalesce(p_posts, '{}')) or ci.shot_id = any (coalesce(p_shots, '{}')));
  end if;
end $function$;

revoke all on function public.file_items(uuid, uuid[], uuid[], uuid) from public, anon;
grant execute on function public.file_items(uuid, uuid[], uuid[], uuid) to authenticated, service_role;
