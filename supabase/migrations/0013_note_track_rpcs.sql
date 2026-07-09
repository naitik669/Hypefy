-- Notes can carry a song: set_note accepts p_track and get_notes returns it.
-- p_track is validated to the app's Track shape ({id,title,artist,artwork,
-- preview}) or null; a note edit without a track clears any previous one.

drop function if exists public.get_notes();
create or replace function public.get_notes()
 returns table(user_id uuid, text text, audience text, created_at timestamp with time zone, is_self boolean, display_name text, username text, avatar_hue integer, avatar_url text, track jsonb)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select n.user_id, n.text, n.audience, n.created_at,
         (n.user_id = (select auth.uid())) as is_self,
         p.display_name, p.username, p.avatar_hue, p.avatar_url,
         n.track
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

-- Drop the 2-arg overload first — leaving it would make 2-arg RPC calls
-- ambiguous between the old and new signatures.
drop function if exists public.set_note(text, text);
create or replace function public.set_note(p_text text, p_audience text default 'mutual'::text, p_track jsonb default null)
 returns notes
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_note public.notes;
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
  if coalesce(p_audience,'mutual') not in ('mutual','close') then raise exception 'Invalid audience'; end if;
  if char_length(trim(coalesce(p_text,''))) = 0 then raise exception 'Note is empty'; end if;
  if p_track is not null and (
    jsonb_typeof(p_track) <> 'object'
    or p_track->>'id' is null
    or p_track->>'title' is null
    or p_track->>'preview' is null
  ) then raise exception 'Invalid track'; end if;

  insert into public.notes (user_id, text, audience, track, created_at, expires_at)
  values ((select auth.uid()), left(trim(p_text), 60), coalesce(p_audience,'mutual'), p_track, now(), now() + interval '24 hours')
  on conflict (user_id) do update
    set text = excluded.text,
        audience = excluded.audience,
        track = excluded.track,
        created_at = now(),
        expires_at = now() + interval '24 hours'
  returning * into v_note;
  return v_note;
end; $function$;
