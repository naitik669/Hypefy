-- Pin a conversation to the top of your inbox (per-member). Updatable by the
-- member via the existing "conv_members: update own" RLS policy.
alter table public.conversation_members add column if not exists pinned_at timestamptz;
