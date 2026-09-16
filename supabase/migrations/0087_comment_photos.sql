-- A comment can be a photo.
--
-- Stored in its own column rather than in the body, which is where GIFs went:
-- a body that begins with https:// is treated as media, so a comment that is
-- nothing but a link renders as a broken image, and a photo could never carry
-- a caption. A column says what the row is.

alter table public.comments add column if not exists image_url text;

-- Readable by everyone who can read the comment. Deliberately NOT insertable
-- or updatable: the grants on this table are column-level, so withholding it
-- means the only way a photo gets onto a comment is create_comment below,
-- which checks where the picture came from.
grant select (image_url) on public.comments to authenticated, anon;

-- A comment has to be something. Body has always been NOT NULL, so a photo
-- posts with an empty one.
alter table public.comments drop constraint if exists comments_body_or_image_check;
alter table public.comments add constraint comments_body_or_image_check check (
  length(btrim(body)) > 0 or image_url is not null
);

-- ── Where the pictures live ───────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comment-images', 'comment-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "comment_images_public_read" on storage.objects;
create policy "comment_images_public_read" on storage.objects
  for select to public using (bucket_id = 'comment-images');

-- Into your own folder only, the same shape every other bucket here uses.
drop policy if exists "comment_images_user_insert" on storage.objects;
create policy "comment_images_user_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comment-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "comment_images_user_delete" on storage.objects;
create policy "comment_images_user_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'comment-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Posting one ───────────────────────────────────────────────────────────
-- The parameter is added rather than defaulted onto the existing function:
-- a new default argument alongside the old signature makes a four-argument
-- call ambiguous, and every existing caller makes one.
drop function if exists public.create_comment(uuid, text, uuid, uuid);
drop function if exists public.create_shot_comment(uuid, text, uuid, uuid);

/**
 * A picture has to be one of ours.
 *
 * The column is not client-writable, so this is the only door — and without
 * this check it would take any URL at all, which is an invitation to hotlink
 * someone else's server or drop a tracking pixel into a thread.
 */
create or replace function public.is_comment_image(p_url text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select p_url ~ '^https://[a-zA-Z0-9.-]+/storage/v1/object/public/comment-images/'
$function$;

create or replace function public.create_comment(
  p_post_id uuid,
  p_body text,
  p_owner_id uuid default null,
  p_parent_id uuid default null,
  p_image_url text default null
) returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
  v_parent_author uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if coalesce(btrim(p_body), '') = '' and p_image_url is null then
    raise exception 'Nothing to post';
  end if;
  if p_image_url is not null and not public.is_comment_image(p_image_url) then
    raise exception 'That picture is not from here';
  end if;

  insert into public.comments (post_id, user_id, body, parent_id, image_url)
  values (p_post_id, v_user, coalesce(trim(p_body), ''), p_parent_id, p_image_url)
  returning id into v_id;

  update public.posts set comment_count = (
    select count(*) from public.comments where post_id = p_post_id and deleted_at is null
  ) where id = p_post_id;

  if p_parent_id is null then
    -- top-level comment → notify the post owner
    if p_owner_id is not null and p_owner_id <> v_user then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (p_owner_id, v_user, 'comment_post', 'post', p_post_id, 'commented on your post')
      on conflict do nothing;
    end if;
  else
    -- reply → notify the parent comment's author
    select user_id into v_parent_author from public.comments where id = p_parent_id;
    if v_parent_author is not null and v_parent_author <> v_user then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (v_parent_author, v_user, 'comment_reply', 'post', p_post_id, 'replied to your comment')
      on conflict do nothing;
    end if;
  end if;

  return v_id;
end;
$function$;

create or replace function public.create_shot_comment(
  p_shot_id uuid,
  p_body text,
  p_owner_id uuid default null,
  p_parent_id uuid default null,
  p_image_url text default null
) returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
  v_parent_author uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if coalesce(btrim(p_body), '') = '' and p_image_url is null then
    raise exception 'Nothing to post';
  end if;
  if p_image_url is not null and not public.is_comment_image(p_image_url) then
    raise exception 'That picture is not from here';
  end if;

  insert into public.comments (shot_id, user_id, body, parent_id, image_url)
  values (p_shot_id, v_user, coalesce(trim(p_body), ''), p_parent_id, p_image_url)
  returning id into v_id;

  update public.shots set comment_count = (
    select count(*) from public.comments where shot_id = p_shot_id and deleted_at is null
  ) where id = p_shot_id;

  if p_parent_id is null then
    if p_owner_id is not null and p_owner_id <> v_user then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (p_owner_id, v_user, 'comment_shot', 'shot', p_shot_id, 'commented on your Shot')
      on conflict do nothing;
    end if;
  else
    select user_id into v_parent_author from public.comments where id = p_parent_id;
    if v_parent_author is not null and v_parent_author <> v_user then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (v_parent_author, v_user, 'comment_reply', 'shot', p_shot_id, 'replied to your comment')
      on conflict do nothing;
    end if;
  end if;

  return v_id;
end;
$function$;

grant execute on function public.create_comment(uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.create_shot_comment(uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.is_comment_image(text) to authenticated, anon;
