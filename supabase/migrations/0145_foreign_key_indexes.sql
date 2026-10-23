-- Covering indexes for the ten foreign keys that had none.
--
-- A foreign key without an index on the referencing column means two things,
-- and the second is the one that bites. The join through it is a sequential
-- scan, which is merely slow. But deleting a row from the PARENT has to
-- check every child for references, and with no index that is a full scan of
-- the child table per deleted row — so deleting one account walks
-- `moderation_actions`, `ghost_shares` and `purchases` end to end, and the
-- cost grows with the whole table rather than with that account's share of
-- it. At 23 accounts nothing notices. At scale, account deletion is the
-- slowest thing in the product and it is the one a person is waiting on.
--
-- `messages_pinned_by_fkey` is the newest of the ten and mine: migration
-- 0142 added the column and its reference without the index to match.
--
-- All partial where the column is nullable, because a null never satisfies a
-- reference check and indexing the nulls would be most of the rows in tables
-- like `messages`, where almost nothing is pinned.

create index if not exists messages_pinned_by_idx
  on public.messages (pinned_by) where pinned_by is not null;

create index if not exists collection_items_added_by_idx
  on public.collection_items (added_by) where added_by is not null;

create index if not exists collection_members_invited_by_idx
  on public.collection_members (invited_by) where invited_by is not null;

create index if not exists ghost_shares_post_idx
  on public.ghost_shares (post_id) where post_id is not null;

create index if not exists ghost_shares_shot_idx
  on public.ghost_shares (shot_id) where shot_id is not null;

create index if not exists group_calls_started_by_idx
  on public.group_calls (started_by);

create index if not exists moderation_actions_actor_idx
  on public.moderation_actions (actor_id);

create index if not exists moderation_actions_target_user_idx
  on public.moderation_actions (target_user_id) where target_user_id is not null;

create index if not exists profiles_suspended_by_idx
  on public.profiles (suspended_by) where suspended_by is not null;

create index if not exists purchases_product_idx
  on public.purchases (product_id);
