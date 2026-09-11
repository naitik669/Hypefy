-- Saved: folders (the app used to call them collections).
--
-- A folder now holds posts and Shots, has an emoji and a colour (a key from
-- the app's palette, like a Spotlight page's), and a place in your order.
-- Existing folders and their items are kept as they are.
--
-- Being in a folder means being saved: filing something saves it, and
-- unsaving something takes it out of every folder, so Saved stays the one
-- place that decides what you keep.

-- 1. Folders.
alter table public.collections
  add column if not exists emoji text,
  add column if not exists color text,
  add column if not exists position integer not null default 0;

alter table public.collections drop constraint if exists collections_emoji_check;
alter table public.collections
  add constraint collections_emoji_check check (emoji is null or char_length(emoji) between 1 and 16);
alter table public.collections drop constraint if exists collections_color_check;
alter table public.collections
  add constraint collections_color_check check (color is null or color ~ '^[a-z]{2,16}$');
alter table public.collections drop constraint if exists collections_name_check;
alter table public.collections
  add constraint collections_name_check check (char_length(btrim(name)) between 1 and 40);

-- 2. What a folder holds: a post or a Shot, exactly one.
alter table public.collection_items
  add column if not exists shot_id uuid references public.shots(id) on delete cascade;
alter table public.collection_items alter column post_id drop not null;
alter table public.collection_items drop constraint if exists collection_items_one_thing;
alter table public.collection_items
  add constraint collection_items_one_thing check (num_nonnulls(post_id, shot_id) = 1);
alter table public.collection_items drop constraint if exists collection_items_collection_id_shot_id_key;
alter table public.collection_items
  add constraint collection_items_collection_id_shot_id_key unique (collection_id, shot_id);
create index if not exists collection_items_shot_idx on public.collection_items (shot_id);

-- Anything already in a folder is saved (a no-op today; kept for safety).
insert into public.saved_posts (user_id, post_id)
select c.user_id, ci.post_id
  from public.collection_items ci
  join public.collections c on c.id = ci.collection_id
 where ci.post_id is not null
on conflict (user_id, post_id) do nothing;

-- 3. Unsaving leaves every folder.
create or replace function public.unsave_leaves_folders()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_table_name = 'saved_posts' then
    delete from public.collection_items ci
     using public.collections c
     where ci.collection_id = c.id and c.user_id = old.user_id and ci.post_id = old.post_id;
  else
    delete from public.collection_items ci
     using public.collections c
     where ci.collection_id = c.id and c.user_id = old.user_id and ci.shot_id = old.shot_id;
  end if;
  return old;
end $function$;

drop trigger if exists saved_posts_leave_folders on public.saved_posts;
create trigger saved_posts_leave_folders after delete on public.saved_posts
  for each row execute function public.unsave_leaves_folders();
drop trigger if exists saved_shots_leave_folders on public.saved_shots;
create trigger saved_shots_leave_folders after delete on public.saved_shots
  for each row execute function public.unsave_leaves_folders();

-- 4. Put one post or Shot in exactly these folders of yours (the sheet of
--    checkboxes): saved if it goes anywhere, out of every folder not listed.
--    Runs as you, so folder and save policies still apply.
create or replace function public.set_item_folders(
  p_post uuid default null,
  p_shot uuid default null,
  p_folders uuid[] default '{}'
)
returns void
language plpgsql
set search_path to 'public'
as $function$
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

  delete from public.collection_items ci
   using public.collections c
   where ci.collection_id = c.id
     and c.user_id = v_uid
     and (ci.post_id = p_post or ci.shot_id = p_shot)
     and not (ci.collection_id = any (coalesce(p_folders, '{}')));

  insert into public.collection_items (collection_id, post_id, shot_id)
  select f, p_post, p_shot
    from unnest(coalesce(p_folders, '{}')) as f
    join public.collections c on c.id = f and c.user_id = v_uid
  on conflict do nothing;
end $function$;

revoke all on function public.set_item_folders(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_item_folders(uuid, uuid, uuid[]) to authenticated, service_role;

-- 5. Your folders, in your order, each with how much is in it and its four
--    newest things for the mosaic on its tile.
create or replace function public.get_folders()
returns table (
  id uuid,
  name text,
  emoji text,
  color text,
  "position" integer,
  cover_url text,
  created_at timestamptz,
  item_count bigint,
  covers jsonb
)
language sql
stable
set search_path to 'public'
as $function$
  select c.id, c.name, c.emoji, c.color, c.position, c.cover_url, c.created_at,
         (select count(*) from public.collection_items ci where ci.collection_id = c.id),
         coalesce((
           select jsonb_agg(x.cover order by x.at desc)
             from (
               select ci.created_at as at,
                      case when ci.post_id is not null
                        then jsonb_build_object('kind', 'post', 'thumb', coalesce(p.image_urls[1], p.image_url))
                        else jsonb_build_object('kind', 'shot', 'thumb', s.poster_url, 'video', s.media_url)
                      end as cover
                 from public.collection_items ci
                 left join public.posts p on p.id = ci.post_id
                 left join public.shots s on s.id = ci.shot_id
                where ci.collection_id = c.id
                order by ci.created_at desc
                limit 4
             ) x
         ), '[]'::jsonb)
    from public.collections c
   where c.user_id = (select auth.uid())
   order by c.position, c.created_at;
$function$;

revoke all on function public.get_folders() from public, anon;
grant execute on function public.get_folders() to authenticated, service_role;

-- 6. Search what you have saved, by caption or by who posted it.
create or replace function public.search_saved(p_q text, p_limit integer default 60)
returns table (kind text, id uuid, thumb text, video text, caption text, saved_at timestamptz)
language sql
stable
set search_path to 'public'
as $function$
  with q as (
    select '%' || replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select * from (
    select 'post'::text, p.id, coalesce(p.image_urls[1], p.image_url), null::text, p.caption, sp.created_at
      from public.saved_posts sp
      join public.posts p on p.id = sp.post_id
      join public.profiles pr on pr.id = p.user_id
      cross join q
     where sp.user_id = (select auth.uid())
       and (p.caption ilike q.pat or pr.username ilike q.pat or pr.display_name ilike q.pat)
    union all
    select 'shot'::text, s.id, s.poster_url, s.media_url, s.caption, ss.created_at
      from public.saved_shots ss
      join public.shots s on s.id = ss.shot_id
      join public.profiles pr on pr.id = s.user_id
      cross join q
     where ss.user_id = (select auth.uid())
       and (s.caption ilike q.pat or pr.username ilike q.pat or pr.display_name ilike q.pat)
  ) found
  order by 6 desc
  limit greatest(1, least(coalesce(p_limit, 60), 200));
$function$;

revoke all on function public.search_saved(text, integer) from public, anon;
grant execute on function public.search_saved(text, integer) to authenticated, service_role;
