-- A Diary's page colour, picked when writing it.
--
-- Stored as a short key ("plum", "cobalt", …) rather than a hex value: the
-- app owns the palette, so it can retune a colour without rewriting rows, and
-- a key it no longer knows simply falls back to the default page. The check is
-- on shape only for the same reason — no list to migrate when one is added.
--
-- Nullable, and null is the default page. Past Diaries keep theirs too.

alter table public.notes add column if not exists color text;
alter table public.diary_archive add column if not exists color text;

-- set_note gains p_color. Dropped and recreated: adding a parameter with
-- CREATE OR REPLACE would make a second overload beside the first.
--
-- A save without a colour keeps the one you had (coalesce), so the older
-- notes editor, which does not know about colours, does not wipe it. The
-- Diary composer always sends one, so choosing the default is still possible.
drop function if exists public.set_note(text, text, jsonb);
create function public.set_note(
  p_text text,
  p_audience text default 'mutual',
  p_track jsonb default null,
  p_color text default null
)
returns public.notes
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
  if p_color is not null and p_color !~ '^[a-z]{2,16}$' then raise exception 'Invalid color'; end if;

  insert into public.notes (user_id, text, audience, track, color, created_at, expires_at)
  values ((select auth.uid()), left(trim(p_text), 60), coalesce(p_audience,'mutual'), p_track, p_color, now(), now() + interval '24 hours')
  on conflict (user_id) do update
    set text = excluded.text,
        audience = excluded.audience,
        track = excluded.track,
        color = coalesce(excluded.color, public.notes.color),
        created_at = now(),
        expires_at = now() + interval '24 hours'
  returning * into v_note;
  return v_note;
end; $function$;

revoke all on function public.set_note(text, text, jsonb, text) from public, anon;
grant execute on function public.set_note(text, text, jsonb, text) to authenticated, service_role;

-- get_notes: same rows, plus the colour. Its return type changes, so it too
-- is dropped and recreated.
drop function if exists public.get_notes();
create function public.get_notes()
returns table(user_id uuid, text text, audience text, created_at timestamptz, is_self boolean,
              display_name text, username text, avatar_hue integer, avatar_url text, track jsonb, color text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select n.user_id, n.text, n.audience, n.created_at,
         (n.user_id = (select auth.uid())) as is_self,
         p.display_name, p.username, p.avatar_hue, p.avatar_url,
         n.track, n.color
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

-- The archive keeps each Diary's colour.
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

  insert into public.diary_archive (user_id, text, audience, track, color, written_at, ended_how)
  values (old.user_id, old.text, old.audience, old.track, old.color, old.created_at, v_how)
  on conflict (user_id, written_at) do nothing;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop function if exists public.get_diary_archive(integer);
create function public.get_diary_archive(p_limit integer default 100)
returns table(id uuid, text text, audience text, track jsonb, written_at timestamptz, ended_how text, color text)
language sql
stable
set search_path to 'public'
as $function$
  select a.id, a.text, a.audience, a.track, a.written_at, a.ended_how, a.color
  from public.diary_archive a
  where a.user_id = (select auth.uid())
  union all
  select null::uuid, n.text, n.audience, n.track, n.created_at, 'expired', n.color
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
