-- Emoji quick-reactions on Notes (the 24h micro-status atop DMs): a quiet
-- signal that doesn't open a conversation. One active reaction per person
-- per note owner; note_created_at snapshots which note instance was reacted
-- to, so reactions on a replaced/expired note become invisible without any
-- cleanup job (readers filter note_created_at = notes.created_at).
create table if not exists public.note_reactions (
  note_owner_id uuid not null references public.profiles(id) on delete cascade,
  reactor_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 8),
  note_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (note_owner_id, reactor_id)
);

alter table public.note_reactions enable row level security;

-- Reactor manages their own reactions.
drop policy if exists note_reactions_reactor_all on public.note_reactions;
create policy note_reactions_reactor_all on public.note_reactions
  for all
  using ((select auth.uid()) = reactor_id)
  with check ((select auth.uid()) = reactor_id);

-- The note's owner can see who reacted.
drop policy if exists note_reactions_owner_select on public.note_reactions;
create policy note_reactions_owner_select on public.note_reactions
  for select
  using ((select auth.uid()) = note_owner_id);
