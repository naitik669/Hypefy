-- What the chat calls someone: one name, everybody sees it.
--
-- 0169 made nicknames private on purpose, and said that if shared ones were
-- ever wanted they would be a different table rather than a widened one,
-- "the privacy rule is the schema". This is that different table. 0169's
-- rows are untouched and still readable by their owner alone.
--
-- The thing 0169 was avoiding is real and arrives with this table: a shared
-- nickname is user-written text about another person, shown to people other
-- than its author, and moderation is still the longest-lead item before
-- launch. Two things carry it in the meantime, and neither needs a rota:
-- any member can clear any nickname, so whoever is unhappy with one can
-- erase it themselves in a tap rather than wait for a queue; and the change
-- is announced as an ordinary message, which the existing report flow
-- already covers ('message' is a report target).
--
-- Who may set one: any member, on any member, including themselves. One
-- rule covers both shapes of chat — in a DM that reads as "yours and
-- theirs", which is what was asked for, and in a group it matches what
-- every other group chat does.

create table if not exists public.conversation_display_names (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- Who is being called it. One name per person per chat: set, replaced,
  -- or cleared, never a pile.
  subject_id uuid not null references public.profiles(id) on delete cascade,
  nickname text not null check (
    btrim(nickname) <> '' and char_length(nickname) between 1 and 40
  ),
  -- Who last changed it. Kept for the announcement's sake and because a
  -- shared label with no author is a shared label nobody can answer for.
  -- Nulled rather than deleted if they leave: the name stays, the chat
  -- still agrees on it.
  set_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, subject_id)
);

-- The primary key already serves "every name in this chat", which is how
-- the thread loads them. These two are for the foreign keys, which are
-- checked on every profile delete.
create index if not exists conversation_display_names_subject_idx
  on public.conversation_display_names (subject_id);
create index if not exists conversation_display_names_set_by_idx
  on public.conversation_display_names (set_by);

alter table public.conversation_display_names enable row level security;

-- Readable by the chat, and only by the chat. Shared does not mean public:
-- a name set inside a group is not something a stranger can read.
create policy "shared nicknames: members read" on public.conversation_display_names
  for select using (public.is_conv_member(conversation_id));

-- No insert, update or delete policy. Everything goes through
-- set_shared_nickname, which is where membership on both sides is checked
-- and where the announcement is written — a direct write would change the
-- name on everyone's screen with nothing in the thread to say who did it.
revoke all on public.conversation_display_names from anon, authenticated;
grant select on public.conversation_display_names to authenticated;

/**
 * Name someone for the whole chat, or clear it.
 *
 * Both sides have to be in it: you, because writing into a thread you
 * cannot see is a thread you should not know about, and them, because
 * naming a stranger is a way to probe for one.
 *
 * A blank name clears, rather than a second function. Setting the name it
 * already has does nothing at all — repeated saves must not fill the
 * thread with announcements of no change.
 */
create or replace function public.set_shared_nickname(
  p_conversation_id uuid,
  p_subject_id uuid,
  p_nickname text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := (select auth.uid());
  -- Control characters and newlines out, runs of whitespace down to one:
  -- a name is drawn on one line next to an avatar, and a 40-character
  -- string of newlines is a way to push the rest of a row off it.
  v_name text := btrim(regexp_replace(coalesce(p_nickname, ''), '[\s\u0000-\u001f\u007f]+', ' ', 'g'));
  v_old text;
  v_actor text;
  v_subject text;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not public.is_conv_member(p_conversation_id) then
    raise exception 'Not a member';
  end if;

  if not exists (
    select 1 from public.conversation_members
     where conversation_id = p_conversation_id and user_id = p_subject_id
  ) then
    raise exception 'Not in this chat';
  end if;

  if char_length(v_name) > 40 then raise exception 'Too long'; end if;

  select nickname into v_old from public.conversation_display_names
   where conversation_id = p_conversation_id and subject_id = p_subject_id;

  -- Nothing changed, so nothing is said.
  if coalesce(v_old, '') = v_name then return; end if;

  -- Their own name, not the nickname being replaced: the announcement has
  -- to name somebody the whole chat can identify.
  select coalesce(display_name, username, 'Someone') into v_subject
    from public.profiles where id = p_subject_id;
  select coalesce(display_name, username, 'Someone') into v_actor
    from public.profiles where id = v_me;

  if v_name = '' then
    delete from public.conversation_display_names
     where conversation_id = p_conversation_id and subject_id = p_subject_id;
    perform public.send_message(
      p_conversation_id,
      case when p_subject_id = v_me
        then v_actor || ' cleared their own nickname'
        else v_actor || ' cleared ' || v_subject || '''s nickname' end,
      'system'
    );
    return;
  end if;

  insert into public.conversation_display_names
    (conversation_id, subject_id, nickname, set_by)
  values (p_conversation_id, p_subject_id, v_name, v_me)
  on conflict (conversation_id, subject_id)
  do update set nickname = excluded.nickname, set_by = excluded.set_by, updated_at = now();

  perform public.send_message(
    p_conversation_id,
    case when p_subject_id = v_me
      then v_actor || ' set their own nickname to ' || v_name
      else v_actor || ' set ' || v_subject || '''s nickname to ' || v_name end,
    'system'
  );
end $$;

revoke all on function public.set_shared_nickname(uuid, uuid, text) from public, anon;
grant execute on function public.set_shared_nickname(uuid, uuid, text) to authenticated;
