-- Ghost Share.
--
-- "I wanted you to see this, without having to tell you." Someone chooses one
-- person they follow who follows them back, and a Shot or post is placed near
-- the top of that person's feed the next time they open it. The recipient is
-- not notified and nothing on the content marks it. The sender is told only
-- that it was placed.
--
-- The whole of the privacy model is in who may read this table: nobody.
--
--   * a recipient must not be able to find out they were targeted, so they
--     cannot read rows about themselves;
--   * a sender must not be able to find out whether it was seen, so they
--     cannot read delivered_at on their own rows;
--   * Hypefy must be able to find out who sent what, because an invisible
--     thing with no record would be an invisible thing nobody could ever be
--     held to account for.
--
-- So: row security on, no policies, no grants, and every read and write goes
-- through a function below that returns exactly what its caller may know.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
revoke all on table public.app_settings from anon, authenticated;

-- The kill switch. Flip to 'false' and nothing more is sent or placed.
insert into public.app_settings (key, value) values ('ghost_share_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- Set by an admin on an account that must not be targeted (an abuse case).
-- Not something a person can set for themselves: there is no opt-out.
alter table public.profiles add column if not exists ghost_no_target boolean not null default false;

create table if not exists public.ghost_shares (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('post', 'shot')),
  post_id uuid references public.posts(id) on delete cascade,
  shot_id uuid references public.shots(id) on delete cascade,
  -- The Monday (India time) of the week it was sent in: what the allowance
  -- and the once-per-person rule are counted against.
  week_start date not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  check ((kind = 'post' and post_id is not null and shot_id is null)
      or (kind = 'shot' and shot_id is not null and post_id is null)),
  check (sender_id <> recipient_id)
);

-- One to the same person per week, held by the database and not by a check
-- that two quick taps could both pass.
create unique index if not exists ghost_shares_pair_week
  on public.ghost_shares (sender_id, recipient_id, week_start);
create index if not exists ghost_shares_waiting
  on public.ghost_shares (recipient_id, kind, created_at)
  where delivered_at is null and cancelled_at is null;
create index if not exists ghost_shares_sender_week
  on public.ghost_shares (sender_id, week_start);

alter table public.ghost_shares enable row level security;
revoke all on table public.ghost_shares from anon, authenticated;

create or replace function public.ghost_share_enabled()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'true'::jsonb from public.app_settings where key = 'ghost_share_enabled'), false);
$$;

/** The Monday this week began on, in India, where a week is counted. */
create or replace function public.ghost_week_start()
returns date
language sql stable set search_path = public as $$
  select (date_trunc('week', now() at time zone 'Asia/Kolkata'))::date;
$$;

-- Who made a Shot or post, if it is still there to be seen by anyone.
create or replace function public.ghost_content_author(p_kind text, p_content_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'post' then (select user_id from public.posts where id = p_content_id and removed_at is null)
    when 'shot' then (select user_id from public.shots where id = p_content_id and removed_at is null)
  end;
$$;

-- May this person be shown this content, by the same rules the feeds use:
-- it exists, its author is not private (or they follow the author), and
-- neither has blocked the other.
create or replace function public.ghost_can_view(p_viewer uuid, p_author uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_author is not null
    and not exists (
      select 1 from public.blocked_users b
       where (b.blocker_id = p_viewer and b.blocked_id = p_author)
          or (b.blocker_id = p_author and b.blocked_id = p_viewer))
    and (
      p_viewer = p_author
      or not coalesce((select is_private from public.profiles where id = p_author), false)
      or exists (select 1 from public.follows f where f.follower_id = p_viewer and f.following_id = p_author)
    );
$$;

-- Do these two follow each other, with no block between them?
create or replace function public.ghost_are_mutuals(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.follows where follower_id = p_a and following_id = p_b)
     and exists (select 1 from public.follows where follower_id = p_b and following_id = p_a)
     and not exists (
       select 1 from public.blocked_users b
        where (b.blocker_id = p_a and b.blocked_id = p_b)
           or (b.blocker_id = p_b and b.blocked_id = p_a));
$$;

create or replace function public.ghost_share_allowance()
returns table (used int, allowed int, resets_at timestamptz)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from public.ghost_shares
      where sender_id = (select auth.uid()) and week_start = public.ghost_week_start()),
    case when coalesce((select is_premium from public.profiles where id = (select auth.uid())), false) then 5 else 2 end,
    ((public.ghost_week_start() + 7)::timestamp at time zone 'Asia/Kolkata');
$$;

-- The people this could be placed for: mutuals who are able to see it.
-- Someone already sent to this week is listed, marked, so the reason they
-- cannot be chosen is visible. Anyone else who cannot receive it is simply
-- absent, which says nothing about why.
create or replace function public.ghost_share_targets(p_kind text, p_content_id uuid)
returns table (
  id uuid, name text, username text, avatar_hue integer, avatar_url text, already_this_week boolean
)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  author as (select public.ghost_content_author(p_kind, p_content_id) as uid),
  mutuals as (
    select f.following_id as uid
      from public.follows f
      join public.follows back on back.follower_id = f.following_id and back.following_id = f.follower_id
     where f.follower_id = (select uid from me)
  ),
  strength as (
    select rs.user_id as uid, rs.strength
      from public.relationship_strength((select array_agg(uid) from mutuals), 60) rs
  )
  select p.id, coalesce(p.display_name, p.username), p.username, p.avatar_hue, p.avatar_url,
         exists (select 1 from public.ghost_shares g
                  where g.sender_id = (select uid from me) and g.recipient_id = p.id
                    and g.week_start = public.ghost_week_start())
    from mutuals m
    join public.profiles p on p.id = m.uid and p.profile_completed
    left join strength s on s.uid = m.uid
   where public.ghost_share_enabled()
     and (select uid from author) is not null
     and m.uid <> (select uid from author)
     and not p.ghost_no_target
     and public.ghost_are_mutuals((select uid from me), m.uid)
     and public.ghost_can_view(m.uid, (select uid from author))
   order by coalesce(s.strength, 0) desc, 2 nulls last
   limit 200;
$$;

-- The one way a Ghost Share is made.
--
-- Two kinds of refusal. Ones about the sender's own state say what they are
-- ("You've used your Ghost Shares for this week"). Ones that would reveal
-- something about the other person (a block, a setting, what they can see)
-- all say the same thing, so nothing can be learned by trying.
create or replace function public.send_ghost_share(p_kind text, p_content_id uuid, p_recipient uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_author uuid;
  v_week date := public.ghost_week_start();
  v_used int;
  v_allowed int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('post', 'shot') then raise exception 'That can''t be Ghost Shared'; end if;
  if not public.ghost_share_enabled() then raise exception 'Ghost Share is off right now'; end if;
  if public.is_suspended(v_uid) then raise exception 'Your account can''t do that right now'; end if;

  perform public.rate_limit('ghost_share', 10, interval '1 hour');

  v_author := public.ghost_content_author(p_kind, p_content_id);
  if v_author is null or not public.ghost_can_view(v_uid, v_author) then
    raise exception 'That can''t be Ghost Shared';
  end if;
  if v_author = v_uid then raise exception 'You can''t Ghost Share your own'; end if;

  select a.used, a.allowed into v_used, v_allowed from public.ghost_share_allowance() a;
  if v_used >= v_allowed then
    raise exception 'You''ve used your Ghost Shares for this week';
  end if;

  if exists (select 1 from public.ghost_shares
              where sender_id = v_uid and recipient_id = p_recipient and week_start = v_week) then
    raise exception 'Already this week';
  end if;

  if p_recipient is null
     or p_recipient = v_uid
     or p_recipient = v_author
     or not public.ghost_are_mutuals(v_uid, p_recipient)
     or coalesce((select ghost_no_target from public.profiles where id = p_recipient), true)
     or not public.ghost_can_view(p_recipient, v_author)
     -- Nobody's feed should be queued five deep with other people's choices.
     or (select count(*) from public.ghost_shares
          where recipient_id = p_recipient and kind = p_kind
            and delivered_at is null and cancelled_at is null and expires_at > now()) >= 5
  then
    raise exception 'Couldn''t place that';
  end if;

  insert into public.ghost_shares (sender_id, recipient_id, kind, post_id, shot_id, week_start)
  values (v_uid, p_recipient, p_kind,
          case when p_kind = 'post' then p_content_id end,
          case when p_kind = 'shot' then p_content_id end,
          v_week);
exception
  when unique_violation then raise exception 'Already this week';
end $$;

-- What the sender may know afterwards: to whom, what, and when. Not whether
-- it was shown, not whether it lapsed, not whether it was refused. Entries
-- leave after seven days whatever became of them, so that "still listed"
-- can never be read as "not seen yet".
create or replace function public.my_ghost_shares()
returns table (
  id uuid, kind text, content_id uuid, created_at timestamptz,
  recipient_name text, recipient_username text, recipient_hue integer, recipient_avatar text
)
language sql stable security definer set search_path = public as $$
  select g.id, g.kind, coalesce(g.post_id, g.shot_id), g.created_at,
         coalesce(p.display_name, p.username), p.username, p.avatar_hue, p.avatar_url
    from public.ghost_shares g
    join public.profiles p on p.id = g.recipient_id
   where g.sender_id = (select auth.uid())
     and g.created_at > now() - interval '7 days'
   order by g.created_at desc;
$$;

-- Placing one. Called by the feed pages as they render, for the person
-- whose feed it is. Returns the id of one Shot or post to lift, or null.
--
-- Every rule is checked again here, because days may have passed: the two
-- may no longer follow each other, someone may have blocked someone, the
-- content may be gone. Anything that no longer qualifies is cancelled and
-- the next one is considered. The caller learns a content id and nothing
-- else: not who, not when, not that there was a queue.
create or replace function public.claim_ghost_share(p_kind text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  r record;
  v_author uuid;
  v_content uuid;
  v_why text;
begin
  if v_uid is null or p_kind not in ('post', 'shot') or not public.ghost_share_enabled() then
    return null;
  end if;

  -- One per visit, and a visit is more than one render: the page is drawn
  -- again on a pull to refresh, on coming back to the tab, on a prefetch.
  -- For half an hour after placing one, the answer is that same one, so it
  -- keeps its place across those and no second one is spent.
  select coalesce(g.post_id, g.shot_id) into v_content
    from public.ghost_shares g
   where g.recipient_id = v_uid and g.kind = p_kind
     and g.delivered_at > now() - interval '30 minutes'
   order by g.delivered_at desc
   limit 1;
  if v_content is not null then return v_content; end if;

  for r in
    select g.id, g.sender_id, g.post_id, g.shot_id
      from public.ghost_shares g
     where g.recipient_id = v_uid and g.kind = p_kind
       and g.delivered_at is null and g.cancelled_at is null
       and g.expires_at > now()
     order by g.created_at
     for update skip locked
  loop
    v_content := coalesce(r.post_id, r.shot_id);
    v_author := public.ghost_content_author(p_kind, v_content);
    v_why := case
      when v_author is null then 'content gone'
      when v_author = v_uid then 'recipient is author'
      when not public.ghost_are_mutuals(r.sender_id, v_uid) then 'not mutuals'
      when not public.ghost_can_view(v_uid, v_author) then 'cannot view'
      when coalesce((select ghost_no_target from public.profiles where id = v_uid), false) then 'do not target'
      when exists (select 1 from public.hypes h
                    where h.user_id = v_uid and h.target_type = p_kind and h.target_id = v_content) then 'already hyped'
      when exists (select 1 from public.ghost_shares d
                    where d.recipient_id = v_uid and d.delivered_at is not null
                      and coalesce(d.post_id, d.shot_id) = v_content) then 'already placed'
    end;

    if v_why is not null then
      update public.ghost_shares set cancelled_at = now(), cancel_reason = v_why where id = r.id;
      continue;
    end if;

    update public.ghost_shares set delivered_at = now() where id = r.id;
    return v_content;
  end loop;

  return null;
end $$;

-- For looking into a report: what was placed in someone's feed, and by whom.
create or replace function public.admin_ghost_shares(p_recipient uuid)
returns table (
  id uuid, sender_id uuid, sender_username text, kind text, content_id uuid,
  created_at timestamptz, delivered_at timestamptz, cancelled_at timestamptz, cancel_reason text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return query
    select g.id, g.sender_id, p.username, g.kind, coalesce(g.post_id, g.shot_id),
           g.created_at, g.delivered_at, g.cancelled_at, g.cancel_reason
      from public.ghost_shares g
      left join public.profiles p on p.id = g.sender_id
     where g.recipient_id = p_recipient
     order by g.created_at desc
     limit 200;
end $$;

revoke all on function public.ghost_share_enabled() from public, anon;
revoke all on function public.ghost_week_start() from public, anon;
revoke all on function public.ghost_content_author(text, uuid) from public, anon, authenticated;
revoke all on function public.ghost_can_view(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ghost_are_mutuals(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ghost_share_allowance() from public, anon;
revoke all on function public.ghost_share_targets(text, uuid) from public, anon;
revoke all on function public.send_ghost_share(text, uuid, uuid) from public, anon;
revoke all on function public.my_ghost_shares() from public, anon;
revoke all on function public.claim_ghost_share(text) from public, anon;
revoke all on function public.admin_ghost_shares(uuid) from public, anon;
grant execute on function public.ghost_share_enabled() to authenticated;
grant execute on function public.ghost_week_start() to authenticated;
grant execute on function public.ghost_share_allowance() to authenticated;
grant execute on function public.ghost_share_targets(text, uuid) to authenticated;
grant execute on function public.send_ghost_share(text, uuid, uuid) to authenticated;
grant execute on function public.my_ghost_shares() to authenticated;
grant execute on function public.claim_ghost_share(text) to authenticated;
grant execute on function public.admin_ghost_shares(uuid) to authenticated;
