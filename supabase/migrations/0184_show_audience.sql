-- Who a Show was posted to, and who it was taken away from.
--
-- Until now every Show went to everybody who could see the author at
-- all. Two things change:
--
--   * `audience` — 'everyone', or 'hypers', which is the app's name for
--     the one private list of people (close_friends; Favourites was
--     folded into it in 0111). The same two-value shape `notes` has had
--     since 0006, with this product's own words.
--
--   * `show_hidden_from` — the per-Show exclusion. Audience says who it
--     is for; this says who it is not for, which is the thing people
--     actually reach for and which no list can express.
--
-- Both become clauses of can_see_show() rather than of the policy. 0183
-- pulled the visibility rule into that one function precisely so the
-- SELECT policy and the three SECURITY DEFINER RPCs could not drift
-- apart; adding a rule in two places now would undo that.

alter table public.shows
  add column if not exists audience text not null default 'everyone';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shows_audience_check'
  ) then
    alter table public.shows
      add constraint shows_audience_check check (audience in ('everyone', 'hypers'));
  end if;
end $$;

comment on column public.shows.audience is
  'everyone, or hypers (close_friends). Enforced in can_see_show().';

-- 0150 revoked column-wide writes and grants one column at a time, so a
-- new column is unwritable by the client until it is named. The whole
-- list is restated rather than added to, which is how 0180 and 0182
-- each did it: a second `grant insert (...)` adds to the set instead of
-- replacing it, and stating it in full keeps this readable against 0150.
grant insert (user_id, media_url, caption, track, linked_post_id, mentions, layers, audience)
  on public.shows to authenticated;
grant update (is_showcase, layers, audience) on public.shows to authenticated;

-- Who this one Show is not for.
--
-- Rows are the author's own business: a list of the people you left out
-- is exactly the thing none of them should be able to read, so the
-- SELECT policy is the author alone. can_see_show runs as SECURITY
-- DEFINER and so reads it regardless, which is the point.
create table if not exists public.show_hidden_from (
  show_id uuid not null references public.shows(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (show_id, user_id)
);

create index if not exists show_hidden_from_user_idx on public.show_hidden_from (user_id);

alter table public.show_hidden_from enable row level security;

drop policy if exists "hidden from: the author's own list" on public.show_hidden_from;
create policy "hidden from: the author's own list" on public.show_hidden_from
  for select using (
    (select auth.uid()) = (select s.user_id from public.shows s where s.id = show_hidden_from.show_id)
  );

drop policy if exists "hidden from: only on your own Show" on public.show_hidden_from;
create policy "hidden from: only on your own Show" on public.show_hidden_from
  for insert with check (
    (select auth.uid()) = (select s.user_id from public.shows s where s.id = show_hidden_from.show_id)
  );

drop policy if exists "hidden from: and you can let them back in" on public.show_hidden_from;
create policy "hidden from: and you can let them back in" on public.show_hidden_from
  for delete using (
    (select auth.uid()) = (select s.user_id from public.shows s where s.id = show_hidden_from.show_id)
  );

revoke all on public.show_hidden_from from anon, authenticated;
grant select, insert, delete on public.show_hidden_from to authenticated;

-- The whole rule, restated with the two new clauses.
--
-- Both exempt the author and neither exempts an admin. That is not an
-- oversight: the privacy clause above has never exempted an admin
-- either, so a Show from a private account is already unreadable to one
-- who does not follow them, and widening admin reach is a decision to
-- take on its own rather than smuggle in beside a feature.
create or replace function public.can_see_show(p_show uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shows s
     where s.id = p_show
       and (s.removed_at is null or s.user_id = (select auth.uid()) or public.is_admin())
       and (
         s.user_id = (select auth.uid())
         or not exists (select 1 from public.profiles p where p.id = s.user_id and coalesce(p.is_private, false))
         or exists (select 1 from public.follows f where f.following_id = s.user_id and f.follower_id = (select auth.uid()))
       )
       and (
         s.expires_at > now()
         or s.user_id = (select auth.uid())
         or public.is_admin()
         or exists (select 1 from public.showcase_items si join public.showcases sc on sc.id = si.showcase_id
                     where si.show_id = s.id and si.removed_at is null and sc.removed_at is null)
       )
       -- Who it was posted to.
       and (
         s.user_id = (select auth.uid())
         or s.audience = 'everyone'
         or exists (select 1 from public.close_friends c
                     where c.user_id = s.user_id and c.friend_id = (select auth.uid()))
       )
       -- And who it was taken away from.
       and (
         s.user_id = (select auth.uid())
         or not exists (select 1 from public.show_hidden_from h
                         where h.show_id = s.id and h.user_id = (select auth.uid()))
       )
  );
$$;

revoke all on function public.can_see_show(uuid) from public;
grant execute on function public.can_see_show(uuid) to anon, authenticated;

-- A mention has to lead somewhere.
--
-- The trigger notified everybody named, which for a Hypers-only Show
-- means telling somebody who cannot open it that they were mentioned in
-- it. That is worse than not telling them: it names the Show, implies
-- they can read it, and ends on an empty screen. The same question
-- can_see_show asks, asked here before the row is written.
create or replace function public.handle_show_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mention text;
  v_target uuid;
begin
  if new.mentions is null then return new; end if;
  foreach v_mention in array new.mentions loop
    select id into v_target from public.profiles
      where lower(username) = lower(v_mention) and id <> new.user_id;
    if v_target is not null
       and (
         new.audience = 'everyone'
         or exists (select 1 from public.close_friends c
                     where c.user_id = new.user_id and c.friend_id = v_target)
       )
       and not exists (select 1 from public.show_hidden_from h
                        where h.show_id = new.id and h.user_id = v_target)
    then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (v_target, new.user_id, 'mention_show', 'show', new.id, 'mentioned you in a Show')
      on conflict do nothing;
    end if;
  end loop;
  return new;
end $$;

revoke execute on function public.handle_show_mentions() from public, anon, authenticated;
