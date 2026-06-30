-- Notes: 24h micro-status shown atop DMs to your mutual-follow circle.
-- close_friends underpins the 'close' audience (manager UI ships in phase 2).

create table if not exists public.close_friends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table public.close_friends enable row level security;
drop policy if exists close_friends_owner_all on public.close_friends;
create policy close_friends_owner_all on public.close_friends
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.notes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 60),
  audience text not null default 'mutual' check (audience in ('mutual','close')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
alter table public.notes enable row level security;
drop policy if exists notes_owner_all on public.notes;
create policy notes_owner_all on public.notes
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index if not exists notes_expires_idx on public.notes(expires_at);

-- Upsert the caller's note (one active note per user), refreshing the 24h window.
create or replace function public.set_note(p_text text, p_audience text default 'mutual')
returns public.notes
language plpgsql security definer set search_path = public as $$
declare v_note public.notes;
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
  if coalesce(p_audience,'mutual') not in ('mutual','close') then raise exception 'Invalid audience'; end if;
  if char_length(trim(coalesce(p_text,''))) = 0 then raise exception 'Note is empty'; end if;

  insert into public.notes (user_id, text, audience, created_at, expires_at)
  values ((select auth.uid()), left(trim(p_text), 60), coalesce(p_audience,'mutual'), now(), now() + interval '24 hours')
  on conflict (user_id) do update
    set text = excluded.text,
        audience = excluded.audience,
        created_at = now(),
        expires_at = now() + interval '24 hours'
  returning * into v_note;
  return v_note;
end; $$;

create or replace function public.clear_note()
returns void
language sql security definer set search_path = public as $$
  delete from public.notes where user_id = (select auth.uid());
$$;

-- The caller's own note first, then notes from mutual-follow users they may see
-- (audience gate + not blocked either way), freshest first.
create or replace function public.get_notes()
returns table (
  user_id uuid,
  text text,
  audience text,
  created_at timestamptz,
  is_self boolean,
  display_name text,
  username text,
  avatar_hue int,
  avatar_url text
)
language sql stable security definer set search_path = public as $$
  select n.user_id, n.text, n.audience, n.created_at,
         (n.user_id = (select auth.uid())) as is_self,
         p.display_name, p.username, p.avatar_hue, p.avatar_url
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
$$;

revoke all on function public.set_note(text, text) from anon;
revoke all on function public.clear_note() from anon;
revoke all on function public.get_notes() from anon;
grant execute on function public.set_note(text, text) to authenticated;
grant execute on function public.clear_note() to authenticated;
grant execute on function public.get_notes() to authenticated;
