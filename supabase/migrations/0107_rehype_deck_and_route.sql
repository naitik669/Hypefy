-- The rehype deck on a post, and the relay route behind it.
--
-- The deck is the small row of faces at the bottom of a post: the people you
-- follow who rehyped it, three at most, with you taking the oldest seat once
-- you rehype it yourself. The route is what a tap on the deck draws: how the
-- post travelled to you — the author, then each person whose rehype it passed
-- through.
--
-- A route needs one fact the tables did not keep: whose rehype you came from.
-- `via_user_id` records it. It is attribution, nothing more, and it can only
-- name someone who really did rehype the same thing — anything else is dropped
-- rather than refused, so a stale client never breaks a rehype.
--
-- Rehypes made before this column existed have no via, so their routes are
-- short: the author, then the rehyper. That is the truth about them.

alter table public.reposts
  add column if not exists via_user_id uuid references public.profiles(id) on delete set null;
alter table public.shot_reposts
  add column if not exists via_user_id uuid references public.profiles(id) on delete set null;

-- ── keep via honest ─────────────────────────────────────────────────────
--
-- Definer, because the person you rehyped from may be a private account whose
-- rehypes you can see (you follow them) but the check should not depend on the
-- caller's view either way: it only answers "did they rehype this", and only
-- ever clears the column.

create or replace function public.clean_rehype_via()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.via_user_id is null then
    return new;
  end if;

  if new.via_user_id = new.user_id then
    new.via_user_id := null;
    return new;
  end if;

  if tg_table_name = 'reposts' then
    if not exists (select 1 from public.reposts r
                    where r.user_id = new.via_user_id and r.post_id = new.post_id) then
      new.via_user_id := null;
    end if;
  else
    if not exists (select 1 from public.shot_reposts r
                    where r.user_id = new.via_user_id and r.shot_id = new.shot_id) then
      new.via_user_id := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists clean_via on public.reposts;
create trigger clean_via before insert on public.reposts
  for each row execute function public.clean_rehype_via();

drop trigger if exists clean_via on public.shot_reposts;
create trigger clean_via before insert on public.shot_reposts
  for each row execute function public.clean_rehype_via();

-- ── the deck ────────────────────────────────────────────────────────────
--
-- Your own rehype (if any), plus the three most recent rehypes by people you
-- follow. Invoker, so rehype visibility (0106) applies: a private account's
-- rehype only reaches its followers, which the follow join implies anyway.
-- The client decides the seating — this only says who and when.

create or replace function public.rehype_deck(p_kind text, p_target uuid)
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  avatar_hue integer,
  is_me boolean,
  rehyped_at timestamptz
)
language sql
stable
set search_path = public
as $$
  with r as (
    select x.user_id, x.created_at from public.reposts x
     where p_kind = 'post' and x.post_id = p_target
    union all
    select x.user_id, x.created_at from public.shot_reposts x
     where p_kind = 'shot' and x.shot_id = p_target
  )
  (
    select r.user_id, p.display_name, p.username, p.avatar_url, p.avatar_hue, true, r.created_at
      from r join public.profiles p on p.id = r.user_id
     where r.user_id = auth.uid()
  )
  union all
  (
    select r.user_id, p.display_name, p.username, p.avatar_url, p.avatar_hue, false, r.created_at
      from r
      join public.profiles p on p.id = r.user_id
      join public.follows f on f.following_id = r.user_id and f.follower_id = auth.uid()
     where r.user_id <> auth.uid()
     order by r.created_at desc
     limit 3
  );
$$;

revoke all on function public.rehype_deck(text, uuid) from public, anon;
grant execute on function public.rehype_deck(text, uuid) to authenticated;

-- ── the route ───────────────────────────────────────────────────────────
--
-- Starting from one person's rehype, follow `via` backwards to the rehype
-- that started the chain. Returned earliest first, ending with the person it
-- started from; the client draws the author before it and "you" after.
--
-- Invoker, so a hop through a private account you do not follow is simply not
-- returned — the route stops being visible there rather than revealing who
-- is behind it. Capped at five hops, and a person never appears twice, so a
-- cycle (A via B, B undone and redone via A) cannot loop.

create or replace function public.rehype_route(p_kind text, p_target uuid, p_from uuid)
returns table (
  hop integer,
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  avatar_hue integer
)
language plpgsql
stable
set search_path = public
as $$
begin
  if p_kind = 'post' then
    return query
      with recursive chain as (
        select 0 as hop, r.user_id, r.via_user_id, array[r.user_id] as seen
          from public.reposts r
         where r.post_id = p_target and r.user_id = p_from
        union all
        select c.hop + 1, r.user_id, r.via_user_id, c.seen || r.user_id
          from chain c
          join public.reposts r on r.post_id = p_target and r.user_id = c.via_user_id
         where c.hop < 5 and not r.user_id = any(c.seen)
      )
      select c.hop, c.user_id, p.display_name, p.username, p.avatar_url, p.avatar_hue
        from chain c join public.profiles p on p.id = c.user_id
       order by c.hop desc;
  elsif p_kind = 'shot' then
    return query
      with recursive chain as (
        select 0 as hop, r.user_id, r.via_user_id, array[r.user_id] as seen
          from public.shot_reposts r
         where r.shot_id = p_target and r.user_id = p_from
        union all
        select c.hop + 1, r.user_id, r.via_user_id, c.seen || r.user_id
          from chain c
          join public.shot_reposts r on r.shot_id = p_target and r.user_id = c.via_user_id
         where c.hop < 5 and not r.user_id = any(c.seen)
      )
      select c.hop, c.user_id, p.display_name, p.username, p.avatar_url, p.avatar_hue
        from chain c join public.profiles p on p.id = c.user_id
       order by c.hop desc;
  end if;
end $$;

revoke all on function public.rehype_route(text, uuid, uuid) from public, anon;
grant execute on function public.rehype_route(text, uuid, uuid) to authenticated;
