# Hypefy Backend Reference

Supabase project: `fyaioseridqabockidyp`. **All migrations are applied to the
live project and tracked in Supabase's `supabase_migrations.schema_migrations`
table** (49 migrations as of this writing — see "Migrations" below). This
document is the source-of-truth inventory so the schema is not a hidden
dependency. **No service-role key is used on the client** — every write goes
through RLS-protected tables or `SECURITY DEFINER` RPCs. The service role is
used only in two server routes (`/api/account/delete`, `/api/push`).

Generated TypeScript types for the whole schema live in
`src/lib/supabase/database.types.ts` (regenerate via Supabase
`generate_typescript_types`).

## Tables (public schema — 22)

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | User identity | id, username, display_name, bio, avatar_url, avatar_hue, banner_id, banner_url, current_vibe, interests[], profile_tags[], profile_completed, **is_private**, **dm_privacy**, **notif_prefs** (jsonb) |
| `posts` | Image/text posts | id, user_id, caption, body, image_url, image_urls[], hashtags[], mentions[], hype_count, comment_count, save_count, share_count, **repost_count** |
| `shots` | Short video reels | id, user_id, media_url, poster_url, caption, hype_count, comment_count, save_count, share_count, in_showcase |
| `shows` | 24h stories (distinct from Shots) | id, user_id, media_url, caption, expires_at, hype_count, **linked_post_id**, **is_showcase** |
| `show_views` | Per-viewer Show view tracking | show_id, viewer_id (pk pair), created_at |
| `hypes` | Likes on post/shot/comment/show | user_id, target_type, target_id (unique together) |
| `comments` | Comments/replies on post or shot | id, post_id, shot_id, user_id, parent_id, body, hype_count, deleted_at |
| `saved_posts` / `saved_shots` | Saves | user_id, post_id / shot_id (unique) |
| `follows` | Social graph | follower_id, following_id (unique, no self) |
| `reposts` | Reposts of a post | user_id, post_id (unique together), created_at |
| `blocked_users` | User-level blocks | blocker_id, blocked_id |
| `conversations` | DMs + groups | id, type('dm'\|'group'), title, avatar_url, created_by, last_message_id, last_message_at |
| `conversation_members` | Membership + read/mute/archive/request state | conversation_id, user_id, role, last_read_at, muted_at, muted_until, archived_at, blocked_at, request_accepted |
| `messages` | Chat messages | id, conversation_id, sender_id, body, kind('text'\|'post'\|'shot'\|'image'), post_id, shot_id, reply_to_id, is_unsent, unsent_at, **edited_at**, metadata (jsonb) |
| `message_reactions` | Emoji reactions | message_id, user_id, emoji (unique) |
| `notifications` | Activity feed | user_id, actor_id, type, target_type, target_id, body, is_read |
| `call_sessions` | 1:1 audio/video calls | conversation_id, caller_id, receiver_id, type, status, quick_reply, started_at, answered_at, ended_at |
| `reports` / `message_reports` | Moderation | reporter_id, target_type, target_id, reason, details, status |
| `push_subscriptions` | Web push devices | user_id, endpoint (unique), p256dh, auth |

## RPCs (SECURITY DEFINER)

| RPC | Args | Notes |
|---|---|---|
| `toggle_hype` | p_target_type, p_target_id, p_owner_id | Idempotent like; returns `{hyped, hype_count}` json; owner notification |
| `create_comment` | p_post_id, p_body, p_parent_id, p_owner_id | Increments comment_count, notifies, parses mentions |
| `create_shot_comment` | p_shot_id, p_body, p_owner_id, p_parent_id | Same for shots |
| `get_or_create_dm` | p_other | Returns conversation id; enforces dm_privacy |
| `create_group` | p_title, p_member_ids[] | Creates group + members |
| `send_message` | p_conversation_id, p_body, p_kind, p_post_id, p_reply_to_id, p_shot_id | Inserts + notifies; share trigger bumps share_count |
| `edit_message` | p_message_id, p_body | Sender-only text edit; sets edited_at |
| `unsend_message` | p_message_id | Sender-only soft delete |
| `toggle_reaction` | p_message_id, p_emoji | One reaction per user |
| `mark_conversation_read` | p_conversation_id | Sets last_read_at = now() |
| `leave_conversation` | p_conversation_id | Removes caller's membership |
| `approve_message_request` | p_conversation_id | Accepts a message request |
| `block_message_request` | p_conversation_id | Blocks a conversation/request |
| `block_user` | p_blocked | User-level block |
| `report_message` | p_message_id, p_reason, p_details | Inserts report |
| `mark_notifications_read` | — | Marks all caller notifications read |
| `start_call` | p_conversation_id, p_receiver_id, p_type | Creates ringing session + incoming_call notification, returns id |
| `accept_call` / `decline_call` / `end_call` | p_call_id | State transitions |
| `quick_reply_call` | p_call_id, p_reply | Sends canned message + declines |
| `mark_call_missed` | p_call_id | Ringing → missed + missed_call notification |

Internal trigger/helper functions: `handle_new_user`, `handle_post_mentions`,
`handle_repost_insert` / `handle_repost_delete`, `bump_post_save_count`,
`bump_shot_save_count`, `bump_share_count`, `touch_conversation`,
`filter_notification_prefs`, `notify_push_webhook`, `is_conv_member`,
`set_updated_at`.

## Triggers

- `saved_posts` / `saved_shots` insert/delete → maintain `save_count`.
- `messages` insert (kind post/shot) → bump target `share_count`.
- `messages` insert → `touch_conversation` updates `conversations.last_message_at`.
- `reposts` insert/delete → maintain `posts.repost_count` + notification.
- `handle_new_user` → seeds a `profiles` row on signup.
- `handle_post_mentions` → notifies @-mentioned users on post insert.
- `notifications` insert → `notify_push_webhook` calls `/api/push` via pg_net
  (after `filter_notification_prefs` enforces per-type opt-outs).

## Storage buckets (7)

| Bucket | Public | Limit | MIME |
|---|---|---|---|
| `avatars` | yes | 5 MB | image/jpeg, png, webp |
| `banners` | yes | 8 MB | image/jpeg, png, webp |
| `post-images` | yes | 10 MB | image/jpeg, png, webp |
| `shot-media` | yes | 50 MB | video/mp4, webm, quicktime |
| `show-media` | yes | 25 MB | image + video |
| `chat-media` | yes | — | image + video (DM attachments) |
| `voice-notes` | yes | — | audio (DM voice messages) |

## RLS summary

All tables have RLS enabled. Reads are scoped to the owner or conversation
members; writes require `auth.uid()` ownership. Notifications can be inserted by
authenticated users (used by client-side follow inserts and RPCs) and
selected/updated only by their owner. Calls are visible only to caller/receiver.
`call_sessions` and `notifications` use `REPLICA IDENTITY FULL` so Realtime can
evaluate RLS on UPDATE/DELETE (their policies reference non-PK columns).

## Migrations

Migration history is tracked in `supabase_migrations.schema_migrations` on the
live project (49 migrations, `20260602050451_create_profiles` →
`20260612135050_add_missing_fk_indexes`). To mirror them into this repo as
files, link the project and pull with the Supabase CLI:

```bash
supabase link --project-ref fyaioseridqabockidyp   # needs DB password
supabase db pull                                    # writes supabase/migrations/*
```

New schema changes should be authored as new migration files and applied via
the Supabase CLI or `apply_migration`, then `database.types.ts` regenerated.

## Indexes

Hot-path indexes exist on: posts/shots `(created_at desc)` and `(user_id)`;
notifications `(user_id, is_read, created_at desc)`; conversations
`(last_message_at desc)`; conversation_members `(conversation_id, user_id)`;
messages `(conversation_id, created_at desc)`; hypes `(target_type, target_id)`
and `(user_id, target_type, target_id)`; plus FK indexes on saves/follows/
comments/reposts/show_views/push_subscriptions. (See the performance advisor for
unused-index cleanup candidates.)

## Terminology

- **Hype** = like · **Shot** = short video reel · **Show** = 24h story (a
  separate feature from Shots) · **Discover** = explore.
