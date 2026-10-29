-- is_showcase stops being read. The column stays, for now.
--
-- 0068 built Showcase boards and said in its own comments that the old
-- in_showcase / is_showcase columns were "deliberately LEFT IN PLACE".
-- Two rows still carry the flag and four code paths still read or write
-- it, which is the state that makes a superseded column dangerous: it
-- is nobody's job, it means something slightly different from the thing
-- that replaced it, and the two can disagree.
--
-- This migration does the half that cannot break anything:
--
--   * moves every flagged Show onto a board, so nothing the flag was
--     keeping alive stops being kept;
--   * stops the reaper reading the flag, and has it ask the boards
--     instead — the same question can_see_show already asks.
--
-- Dropping the column is a migration of its own, deliberately separate
-- and deliberately after this has been live. A DROP COLUMN cannot be
-- undone, and there is no reason to run it in the same breath as the
-- change that makes it safe. It is not numbered here on purpose: the
-- next number belongs to whatever ships next, not to a reservation.

-- Every flagged Show onto a board, creating one per author if needed.
--
-- "Kept" is the word the UI used for these, so it is the word on the
-- board — somebody opening it should recognise what they are looking
-- at rather than find a title this migration invented.
with flagged as (
  select distinct s.user_id
    from public.shows s
   where coalesce(s.is_showcase, false)
     and not exists (
       select 1 from public.showcase_items si
        where si.show_id = s.id and si.removed_at is null
     )
),
made as (
  insert into public.showcases (user_id, title)
  select f.user_id, 'Kept'
    from flagged f
   where not exists (
     select 1 from public.showcases sc
      where sc.user_id = f.user_id and sc.title = 'Kept' and sc.removed_at is null
   )
  returning id, user_id
),
boards as (
  select id, user_id from made
  union all
  select sc.id, sc.user_id
    from public.showcases sc join flagged f on f.user_id = sc.user_id
   where sc.title = 'Kept' and sc.removed_at is null
)
-- A 'show' item carries the id alone: showcase_items_source requires
-- media_url and caption to be null for this kind, because the board
-- reads them through the join rather than copying them. Writing them
-- anyway is what the first draft did, and the constraint refused it.
insert into public.showcase_items (showcase_id, kind, show_id, position)
select distinct on (s.id)
       b.id, 'show', s.id,
       coalesce((select max(si.position) + 1 from public.showcase_items si where si.showcase_id = b.id), 0)
  from public.shows s
  join boards b on b.user_id = s.user_id
 where coalesce(s.is_showcase, false)
   and not exists (
     select 1 from public.showcase_items si
      where si.show_id = s.id and si.removed_at is null
   );

-- The reaper asks the boards, not the flag.
--
-- It skipped a Show because is_showcase was set. A Show on a board has
-- to survive for the same reason, and that is the condition the SELECT
-- policy has used since 0183 — so the thing that decides what is
-- readable and the thing that decides what is deleted now agree, which
-- they did not before.
comment on column public.shows.is_showcase is
  'SUPERSEDED by showcase_items (0068). Nothing reads this as of 0185; safe to drop.';

-- And the reaper's own query stops reading it.
--
-- Caught after the fact: the first draft of this migration changed the
-- API route and claimed "nothing reads the flag", but reap_expired_shows
-- still filtered on it. Left that way, the eventual DROP COLUMN would
-- have taken the nightly reaper down with it.
--
-- The showcase_items check below already covers every Show the flag
-- was protecting, because the insert above put them all on a board.
create or replace function public.reap_expired_shows()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'show_reap_secret';
  -- Not configured yet. Do nothing rather than post unauthenticated.
  if v_secret is null then return; end if;

  for v_row in
    select s.id
      from public.shows s
     where s.expires_at <= now() - interval '30 days'
       and not exists (
         select 1
           from public.showcase_items si
          where si.show_id = s.id
            and si.removed_at is null
       )
     -- Oldest first, and a ceiling: the first run after this ships has
     -- years of backlog to get through, and a thousand HTTP posts from
     -- one transaction is its own outage.
     order by s.expires_at
     limit 200
  loop
    perform net.http_post(
      url := 'https://www.hypefy.chat/api/shows/reap',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-show-reap-secret', v_secret
      ),
      body := jsonb_build_object('show_id', v_row.id)
    );
  end loop;
end $$;

revoke execute on function public.reap_expired_shows() from public, anon, authenticated;

-- So does the "posted a Show" notification — and while it is being
-- restated, the hole it has carried since 0184.
--
-- It told every follower, which for a Hypers-only Show means telling
-- somebody who cannot open it, and for a Show hidden from them means
-- telling the one person it was kept from. 0184 fixed exactly this for
-- mentions and did not check here; found while auditing what still
-- reads is_showcase before dropping the column.
--
-- The is_showcase guard goes with it. It was always dead on this path:
-- the flag was only ever set by a later update, never on the insert
-- this trigger fires from.
create or replace function public.notify_show_posted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
  select f.follower_id, new.user_id, 'show_posted', 'show', new.id, 'posted a Show'
    from public.follows f
    join public.profiles p on p.id = f.follower_id
   where f.following_id = new.user_id
     and p.notif_prefs -> 'shows_posted' = 'true'::jsonb
     -- In the room it was posted to.
     and (
       new.audience = 'everyone'
       or exists (select 1 from public.close_friends c
                   where c.user_id = new.user_id and c.friend_id = f.follower_id)
     )
     -- And not one of the people it was kept from.
     and not exists (
       select 1 from public.show_hidden_from h
        where h.show_id = new.id and h.user_id = f.follower_id
     )
     and not exists (
       select 1 from public.notifications n
        where n.user_id = f.follower_id and n.actor_id = new.user_id and n.type = 'show_posted'
          and n.created_at > now() - interval '6 hours')
     and not exists (
       select 1 from public.blocked_users b
        where (b.blocker_id = f.follower_id and b.blocked_id = new.user_id)
           or (b.blocker_id = new.user_id and b.blocked_id = f.follower_id));

  return new;
end $$;

revoke execute on function public.notify_show_posted() from public, anon, authenticated;
