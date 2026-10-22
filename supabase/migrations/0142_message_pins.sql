-- Pinned messages: a conversation's own noticeboard.
--
-- A pin belongs to the conversation, not to the person who made it: both
-- sides of a DM, and every member of a group, see the same board. That is
-- the point of it — "keep this where we can both find it" — and it is why
-- the columns live on the message rather than in a per-reader table.
--
-- Anything can be pinned: a photo, a Shot, a voice note, a line of text.
-- The board shows each on the side its sender's bubbles are on, so it reads
-- with the same left/right grammar as the thread it came from.

alter table public.messages
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references public.profiles(id) on delete set null;

-- The board asks for one conversation's pins, newest first. Partial, because
-- all but a handful of rows in the table are not pinned.
create index if not exists messages_pinned_idx
  on public.messages (conversation_id, pinned_at desc)
  where pinned_at is not null;

/**
 * How many messages one conversation may keep pinned.
 *
 * Larger than the three a profile allows, because this is a shared working
 * surface rather than a showcase: an address, a plan, the photo of the
 * whiteboard. Small enough that the board stays a board — past a certain
 * number nobody finds anything on it and Shared is the better screen.
 */
create or replace function public.max_pinned_messages()
returns integer language sql immutable as $$ select 30 $$;

/**
 * Pin or unpin a message on its conversation's board.
 *
 * Any member may pin any message in the chat, including the other person's —
 * pinning is "we should both be able to find this", not an author's claim on
 * their own words. The sender keeps the right to unsend regardless; an unsent
 * or removed message simply stops being readable, and the board filters it
 * out, so no cleanup is needed here.
 *
 * Not the client's columns to write: the trigger below makes this function
 * the only way in, and it is what enforces membership and the cap.
 */
create or replace function public.set_message_pinned(p_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := (select auth.uid()); v_conv uuid; v_kind text; v_n int; v_count int;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  select conversation_id, kind into v_conv, v_kind
    from public.messages
   where id = p_id and not is_unsent and removed_at is null;
  if v_conv is null then raise exception 'No such message'; end if;
  if not public.is_conv_member(v_conv) then raise exception 'Not your chat'; end if;

  -- Not a join notice, and not a one-shot: that is a message whose whole
  -- purpose is to be seen once and go, and a pin is a promise to keep it.
  if p_pinned and v_kind in ('system', 'oneshot') then
    raise exception 'That cannot be pinned';
  end if;

  if p_pinned then
    select count(*) into v_count from public.messages
     where conversation_id = v_conv and pinned_at is not null and id <> p_id;
    if v_count >= public.max_pinned_messages() then
      raise exception 'This chat can pin % messages. Unpin one first.', public.max_pinned_messages();
    end if;
  end if;

  -- Opened immediately before the write and closed straight after, not at the
  -- top of the function. `set_config(…, true)` is local to the TRANSACTION,
  -- not to the call: left open, every statement after this one in the same
  -- transaction could write the pin columns freely. Measured — a direct
  -- update after the rpc went through until this was narrowed.
  perform set_config('hypefy.pinning', 'on', true);
  update public.messages
     set pinned_at = case when p_pinned then now() else null end,
         pinned_by = case when p_pinned then v_me else null end
   where id = p_id;
  get diagnostics v_n = row_count;
  perform set_config('hypefy.pinning', 'off', true);

  if v_n = 0 then raise exception 'No such message'; end if;
end $$;

revoke all on function public.set_message_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_message_pinned(uuid, boolean) to authenticated;

/**
 * Keep the two pin columns out of reach of a direct update.
 *
 * `revoke update (pinned_at, pinned_by)` is not enough on its own: Supabase's
 * default privileges give `authenticated` UPDATE on the whole table, and in
 * Postgres a table-wide grant already covers every column — revoking a
 * column subset from a role that holds it does not take anything away. The
 * revoke is kept below because it is right if those grants are ever narrowed,
 * but this trigger is what actually enforces it.
 *
 * Without it the sender's own update policy would let them set pinned_at
 * directly, past both the membership check and the cap, and set pinned_by to
 * anyone they liked — which is a caption on the board claiming someone else
 * put a message up.
 */
create or replace function public.guard_message_pins()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.pinned_at is distinct from old.pinned_at or new.pinned_by is distinct from old.pinned_by)
     and coalesce(current_setting('hypefy.pinning', true), '') <> 'on' then
    raise exception 'Use set_message_pinned to pin a message';
  end if;
  return new;
end $$;

drop trigger if exists guard_message_pins on public.messages;
create trigger guard_message_pins
  before update on public.messages
  for each row execute function public.guard_message_pins();

revoke update (pinned_at, pinned_by) on public.messages from authenticated, anon;
