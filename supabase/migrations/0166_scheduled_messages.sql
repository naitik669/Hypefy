-- Messages written now, sent later.
--
-- Shaped after scheduled_posts (0017): its own table so the messages table
-- and every query over it stay untouched, and a pg_cron job moves due rows
-- across. Text only. Scheduling an attachment would mean holding an uploaded
-- object with no message pointing at it, which is a different problem.
--
-- ── The part that is not like scheduled posts ─────────────────────────────
--
-- Publishing a post is a pure row move. Sending a message is not, because
-- the right to send it can disappear between writing and sending: the
-- recipient can block you, you can leave the group, your account can be
-- suspended.
--
-- `messages` has triggers for exactly those — tg_messages_refuse_blocked,
-- tg_block_suspended, tg_rate_limit — and **not one of them fires here**.
-- Every one begins by reading auth.uid(), which is null in a cron job, and
-- returns early. Relying on them would mean a message scheduled on Monday
-- and blocked on Tuesday arriving on Wednesday. So the three checks are made
-- explicitly below, against the state at delivery time rather than at
-- scheduling time.
--
-- touch_conversation does fire — it reads no auth state — so last_message_at
-- is bumped automatically. last_message_id is not, and send_message sets it,
-- so this does too.
--
-- A message that cannot be sent is dropped rather than held. Holding a
-- suspended user's message until the suspension lifts would deliver it at a
-- moment nobody chose, and retrying forever is worse than losing it. The
-- sender sees it vanish from their scheduled list, which is the signal.

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  -- Already sealed when the sender's device could seal it, exactly as a live
  -- message is; this never looks inside.
  body text not null,
  reply_to_id uuid references public.messages(id) on delete set null,
  scheduled_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint scheduled_messages_body_len
    check (char_length(body) between 1 and 4000)
);

-- The sender's own list, and the publisher's sweep.
create index if not exists scheduled_messages_sender_idx
  on public.scheduled_messages (sender_id, scheduled_at);
create index if not exists scheduled_messages_due_idx
  on public.scheduled_messages (scheduled_at);
create index if not exists scheduled_messages_conversation_idx
  on public.scheduled_messages (conversation_id, scheduled_at);
-- Foreign keys get covered indexes here, unlike the six 0164 had to repair.
create index if not exists scheduled_messages_reply_to_idx
  on public.scheduled_messages (reply_to_id);

alter table public.scheduled_messages enable row level security;

-- Only ever your own: a pending message is not part of the conversation yet,
-- and the other person has no business seeing one that may never arrive.
create policy "scheduled_messages: own read" on public.scheduled_messages
  for select using (sender_id = (select auth.uid()));

-- Cancelling. No update policy: changing the text or the time is cancel and
-- re-schedule, which keeps one way for a row to come into being.
create policy "scheduled_messages: own delete" on public.scheduled_messages
  for delete using (sender_id = (select auth.uid()));

-- No insert policy. Everything goes through schedule_message below, which is
-- where the membership and block checks live.

/** How far ahead a message may be scheduled, and how many may be pending. */
create or replace function public.scheduled_message_limits()
returns table (min_lead interval, max_ahead interval, max_pending integer)
language sql immutable parallel safe
as $function$ select interval '30 seconds', interval '90 days', 50 $function$;

/**
 * Write a message to be sent later.
 *
 * Checks the same things send_message checks, now, so an impossible schedule
 * fails while the sender is looking at it rather than silently three days
 * later. They are all checked AGAIN at delivery, because any of them can
 * change in between — that is the whole hazard of this feature.
 */
create or replace function public.schedule_message(
  p_conversation_id uuid,
  p_body text,
  p_scheduled_at timestamptz,
  p_reply_to_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := (select auth.uid());
  v_lim record;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_conv_member(p_conversation_id) then
    raise exception 'Not a member';
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'Empty message';
  end if;

  select * into v_lim from public.scheduled_message_limits();

  if p_scheduled_at is null or p_scheduled_at < now() + v_lim.min_lead then
    raise exception 'Pick a time at least a moment from now';
  end if;
  if p_scheduled_at > now() + v_lim.max_ahead then
    raise exception 'That is too far ahead';
  end if;

  if exists (
    select 1 from public.conversation_members cm
    join public.blocked_users b on b.blocker_id = cm.user_id and b.blocked_id = v_me
    where cm.conversation_id = p_conversation_id and cm.user_id <> v_me
  ) then
    raise exception 'blocked';
  end if;

  -- A bound on how much a single account can queue up.
  if (select count(*) from public.scheduled_messages where sender_id = v_me) >= v_lim.max_pending then
    raise exception 'You have too many scheduled messages already';
  end if;

  -- Only a message in this same conversation can be replied to.
  insert into public.scheduled_messages (conversation_id, sender_id, body, reply_to_id, scheduled_at)
  values (
    p_conversation_id, v_me, btrim(p_body),
    (select m.id from public.messages m
      where m.id = p_reply_to_id and m.conversation_id = p_conversation_id),
    p_scheduled_at
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.schedule_message(uuid, text, timestamptz, uuid) from public, anon;
grant execute on function public.schedule_message(uuid, text, timestamptz, uuid) to authenticated;

/**
 * Send everything that has come due.
 *
 * Each message is its own subtransaction. One that cannot be delivered —
 * because a trigger refuses it, or the conversation went away mid-sweep —
 * must not take the rest of the batch down with it.
 */
create or replace function public.deliver_due_messages()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_msg_id uuid;
  v_sent int := 0;
begin
  for r in
    select * from public.scheduled_messages
    where scheduled_at <= now()
    order by scheduled_at
    limit 200
  loop
    begin
      -- Still in the conversation.
      if not exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = r.conversation_id and cm.user_id = r.sender_id
      ) then
        delete from public.scheduled_messages where id = r.id;
        continue;
      end if;

      -- Not blocked by anyone who would receive it. The trigger that
      -- normally enforces this reads auth.uid() and is asleep here.
      if exists (
        select 1 from public.conversation_members cm
        join public.blocked_users b
          on b.blocker_id = cm.user_id and b.blocked_id = r.sender_id
        where cm.conversation_id = r.conversation_id and cm.user_id <> r.sender_id
      ) then
        delete from public.scheduled_messages where id = r.id;
        continue;
      end if;

      -- Not suspended. Same reason.
      if exists (
        select 1 from public.profiles p
        where p.id = r.sender_id
          and p.suspended_at is not null
          and (p.suspended_until is null or p.suspended_until > now())
      ) then
        delete from public.scheduled_messages where id = r.id;
        continue;
      end if;

      insert into public.messages (conversation_id, sender_id, body, kind, reply_to_id)
      values (r.conversation_id, r.sender_id, r.body, 'text', r.reply_to_id)
      returning id into v_msg_id;

      -- touch_conversation sets last_message_at; send_message also sets this.
      update public.conversations
         set last_message_id = v_msg_id, updated_at = now()
       where id = r.conversation_id;

      delete from public.scheduled_messages where id = r.id;
      v_sent := v_sent + 1;
    exception
      when others then
        -- Dropped rather than retried forever. Every failure here is a
        -- permanent "cannot send", not a transient one.
        delete from public.scheduled_messages where id = r.id;
    end;
  end loop;

  return v_sent;
end;
$function$;

revoke all on function public.deliver_due_messages() from public, anon, authenticated;

select cron.schedule(
  'deliver-scheduled-messages',
  '* * * * *',
  $$select public.deliver_due_messages();$$
);
