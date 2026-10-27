-- What you call someone, in one chat.
--
-- A group of eight display names, half of them a first name and half an
-- aesthetic, is hard to read. A nickname fixes that for the person doing
-- the reading.
--
-- Personal, not shared. A nickname everybody sees is a new surface for
-- user-written text about another person — which needs reporting, takedown
-- and somebody to action it, and moderation is already the longest-lead
-- item before launch. Nobody but you ever sees what you call someone, so
-- there is nothing here to report and nothing to moderate. If shared
-- nicknames are wanted later they are a different table, not a widened
-- one: the privacy rule is the schema.

create table if not exists public.conversation_nicknames (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- Who is doing the calling. Only they ever read this row.
  owner_id uuid not null references public.profiles(id) on delete cascade,
  -- Who is being called it.
  subject_id uuid not null references public.profiles(id) on delete cascade,
  nickname text not null check (
    btrim(nickname) <> '' and char_length(nickname) between 1 and 40
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, owner_id, subject_id)
);

-- Read as "everything I have named in this chat", which is how the thread
-- loads them: one query per conversation, not one per member.
create index if not exists conversation_nicknames_mine_idx
  on public.conversation_nicknames (owner_id, conversation_id);

alter table public.conversation_nicknames enable row level security;

-- Yours alone, in every direction. The subject cannot read what you call
-- them, which is the whole reason this needs no moderation.
create policy "nicknames: own read" on public.conversation_nicknames
  for select using (owner_id = (select auth.uid()));

create policy "nicknames: own delete" on public.conversation_nicknames
  for delete using (owner_id = (select auth.uid()));

-- No insert or update policy: everything goes through set_nickname, which
-- is where membership is checked. Naming someone in a chat you are not in
-- would be a way to find out they exist.
revoke all on public.conversation_nicknames from anon, authenticated;
grant select, delete on public.conversation_nicknames to authenticated;

/**
 * Name someone, or stop.
 *
 * Both sides have to be in the chat: you, because a nickname in a thread
 * you cannot see is a thread you should not know about, and them, because
 * naming a stranger is a way to probe for one.
 *
 * A blank name is how you clear it, rather than a second function.
 */
create or replace function public.set_nickname(
  p_conversation_id uuid,
  p_subject_id uuid,
  p_nickname text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_name text := btrim(coalesce(p_nickname, ''));
begin
  if not public.is_conv_member(p_conversation_id) then
    raise exception 'Not a member';
  end if;

  if v_name = '' then
    delete from public.conversation_nicknames
     where conversation_id = p_conversation_id
       and owner_id = auth.uid()
       and subject_id = p_subject_id;
    return;
  end if;

  if char_length(v_name) > 40 then
    raise exception 'Too long';
  end if;

  if not exists (
    select 1 from public.conversation_members
     where conversation_id = p_conversation_id and user_id = p_subject_id
  ) then
    raise exception 'Not in this chat';
  end if;

  insert into public.conversation_nicknames
    (conversation_id, owner_id, subject_id, nickname)
  values (p_conversation_id, auth.uid(), p_subject_id, v_name)
  on conflict (conversation_id, owner_id, subject_id)
  do update set nickname = excluded.nickname, updated_at = now();
end $$;

revoke all on function public.set_nickname(uuid, uuid, text) from public, anon;
grant execute on function public.set_nickname(uuid, uuid, text) to authenticated;
