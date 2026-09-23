-- Photos on a page.
--
-- A page was words, a colour and a song. It can now carry one picture, shown
-- above the words on the card (see DiaryPage). Square by default, like every
-- other picture the app crops for itself.
--
-- The picture lives in its own bucket rather than post-images: pages expire
-- after 24 hours and their pictures should be as throwaway as they are, so
-- keeping them apart is what makes a sweep possible later without touching
-- anything anyone posted.

alter table public.notes add column if not exists image_url text;
alter table public.diary_archive add column if not exists image_url text;

-- ── the bucket ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('page-media', 'page-media', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 8388608,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "page-media: public read" on storage.objects;
create policy "page-media: public read" on storage.objects
  for select using (bucket_id = 'page-media');

-- Uploads land in a folder named for the writer, which is what makes the
-- delete policy below possible.
drop policy if exists "page-media: own upload" on storage.objects;
create policy "page-media: own upload" on storage.objects
  for insert with check (
    bucket_id = 'page-media'
    and auth.uid() is not null
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "page-media: own delete" on storage.objects;
create policy "page-media: own delete" on storage.objects
  for delete using (
    bucket_id = 'page-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── writing a page ────────────────────────────────────────────────────────
-- A page with a picture may have no words: the picture is the page then.
create or replace function public.set_note(
  p_text text,
  p_audience text default 'mutual'::text,
  p_track jsonb default null,
  p_image_url text default null
)
returns notes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_note public.notes;
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
  if coalesce(p_audience,'mutual') not in ('mutual','close') then raise exception 'Invalid audience'; end if;
  if char_length(trim(coalesce(p_text,''))) = 0 and coalesce(p_image_url,'') = '' then
    raise exception 'Note is empty';
  end if;
  if p_track is not null and (
    jsonb_typeof(p_track) <> 'object'
    or p_track->>'id' is null
    or p_track->>'title' is null
    or p_track->>'preview' is null
  ) then raise exception 'Invalid track'; end if;
  -- Only a picture this project stores, so a page cannot carry a link to
  -- somewhere else dressed up as its own photo.
  if p_image_url is not null and p_image_url !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/page-media/' then
    raise exception 'Invalid image';
  end if;

  insert into public.notes (user_id, text, audience, track, image_url, created_at, expires_at)
  values ((select auth.uid()), left(trim(coalesce(p_text,'')), 60), coalesce(p_audience,'mutual'),
          p_track, p_image_url, now(), now() + interval '24 hours')
  on conflict (user_id) do update
    set text = excluded.text,
        audience = excluded.audience,
        track = excluded.track,
        image_url = excluded.image_url,
        created_at = now(),
        expires_at = now() + interval '24 hours'
  returning * into v_note;
  return v_note;
end; $function$;

revoke all on function public.set_note(text, text, jsonb, text) from public, anon;
grant execute on function public.set_note(text, text, jsonb, text) to authenticated, service_role;

-- ── reading pages ─────────────────────────────────────────────────────────
drop function if exists public.get_notes();
create function public.get_notes()
returns table(user_id uuid, text text, audience text, created_at timestamptz, is_self boolean,
              display_name text, username text, avatar_hue integer, avatar_url text, track jsonb,
              color text, image_url text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select n.user_id, n.text, n.audience, n.created_at,
         (n.user_id = (select auth.uid())) as is_self,
         p.display_name, p.username, p.avatar_hue, p.avatar_url,
         n.track, n.color, n.image_url
  from public.notes n
  join public.profiles p on p.id = n.user_id
  where n.expires_at > now()
    and (
      n.user_id = (select auth.uid())
      or (
        exists (select 1 from public.follows f1
                where f1.follower_id = (select auth.uid()) and f1.following_id = n.user_id)
        and exists (select 1 from public.follows f2
                where f2.follower_id = n.user_id and f2.following_id = (select auth.uid()))
        and (
          n.audience = 'mutual'
          or exists (select 1 from public.close_friends cf
                     where cf.user_id = n.user_id and cf.friend_id = (select auth.uid()))
        )
        and not exists (
          select 1 from public.blocked_users b
          where (b.blocker_id = (select auth.uid()) and b.blocked_id = n.user_id)
             or (b.blocker_id = n.user_id and b.blocked_id = (select auth.uid()))
        )
      )
    )
  order by is_self desc, n.created_at desc;
$function$;

revoke all on function public.get_notes() from public, anon;
grant execute on function public.get_notes() to authenticated, service_role;

-- ── the archive keeps the picture too ─────────────────────────────────────
create or replace function public.archive_diary()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_how text;
begin
  if tg_op = 'UPDATE' then
    if new.created_at = old.created_at then
      return new;
    end if;
    v_how := case when old.expires_at <= now() then 'expired' else 'replaced' end;
  else
    v_how := case when old.expires_at <= now() then 'expired' else 'taken_down' end;
  end if;

  insert into public.diary_archive (user_id, text, audience, track, color, image_url, written_at, ended_how)
  values (old.user_id, old.text, old.audience, old.track, old.color, old.image_url, old.created_at, v_how)
  on conflict (user_id, written_at) do nothing;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop function if exists public.get_diary_archive(integer);
create function public.get_diary_archive(p_limit integer default 100)
returns table(id uuid, text text, audience text, track jsonb, written_at timestamptz,
              ended_how text, color text, image_url text)
language sql
stable
set search_path to 'public'
as $function$
  select a.id, a.text, a.audience, a.track, a.written_at, a.ended_how, a.color, a.image_url
  from public.diary_archive a
  where a.user_id = (select auth.uid())
  union all
  select null::uuid, n.text, n.audience, n.track, n.created_at, 'expired', n.color, n.image_url
  from public.notes n
  where n.user_id = (select auth.uid())
    and n.expires_at <= now()
    and not exists (
      select 1 from public.diary_archive a2
      where a2.user_id = n.user_id and a2.written_at = n.created_at
    )
  order by written_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$;

revoke all on function public.get_diary_archive(integer) from public, anon;
grant execute on function public.get_diary_archive(integer) to authenticated, service_role;
