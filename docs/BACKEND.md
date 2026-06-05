# Hypefy Backend Reference

Supabase project: `fyaioseridqabockidyp`. All migrations are applied to the live
project. This document is the source-of-truth inventory so the schema is not a
hidden dependency. **No service-role key is used on the client** — every write
goes through RLS-protected tables or `SECURITY DEFINER` RPCs.

## Tables (public schema)

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | User identity | id, username, display_name, bio, avatar_url, avatar_hue, banner_id, banner_url, profile_tags[], profile_completed |
| `posts` | Image/text posts | id, user_id, caption, body, image_url, image_urls[], hashtags[], mentions[], hype_count, comment_count, save_count, share_count |
| `shots` | Short video reels | id, user_id, media_url, poster_url, caption, hype_count, comment_count, save_count, share_count, in_showcase |
| `shows` | 24h stories (distinct from Shots) | id, user_id, media_url, caption, expires_at, hype_count |
| `hypes` | Likes on post/shot/comment | user_id, target_type, target_id (unique together) |
| `comments` | Comments/replies on post or shot | id, post_id, shot_id, user_id, parent_id, body, hype_count, deleted_at |
| `saved_posts` / `saved_shots` | Saves | user_id, post_id / shot_id (unique) |
| `follows` | Social graph | follower_id, following_id (unique, no self) |
| `conversations` | DMs + groups | id, type('dm'|'group'), title, last_message_at |
| `conversation_members` | Membership + read state | conversation_id, user_id, role, last_read_at |
| `messages` | Chat messages | id, conversation_id, sender_id, body, kind('text'|'post'|'shot'|'image'), post_id, shot_id, reply_to_id, is_unsent |
| `message_reactions` | Emoji reactions | message_id, user_id, emoji (unique) |
| `notifications` | Activity feed | user_id, actor_id, type, target_type, target_id, body, is_read |
| `call_sessions` | 1:1 audio/video calls | conversation_id, caller_id, receiver_id, type, status, quick_reply, started_at, answered_at, ended_at |
| `reports` / `message_reports` | Moderation | reporter_id, target_type, target_id, reason, details, status |

## RPCs

| RPC | Args | Notes |
|---|---|---|
| `toggle_hype` | p_target_type, p_target_id, p_owner_id | Idempotent like + owner notification |
| `create_comment` | p_post_id, p_body, p_parent_id, p_owner_id | Increments comment_count, notifies, parses mentions |
| `create_shot_comment` | p_shot_id, p_body, p_owner_id, p_parent_id | Same for shots |
| `get_or_create_dm` | p_other | Returns conversation id |
| `create_group` | p_title, p_member_ids[] | Creates group + members |
| `send_message` | p_conversation_id, p_body, p_kind, p_post_id, p_reply_to_id, p_shot_id | Inserts + notifies; share trigger bumps share_count |
| `mark_conversation_read` | p_conversation_id | Sets last_read_at = now() |
| `mark_notifications_read` | — | Marks all caller notifications read |
| `toggle_reaction` | p_message_id, p_emoji | One reaction per user |
| `unsend_message` | p_message_id | Sender-only soft delete |
| `report_message` | p_message_id, p_reason, p_details | Inserts report |
| `start_call` | p_conversation_id, p_receiver_id, p_type | Creates ringing session + incoming_call notification, returns id |
| `accept_call` | p_call_id | Receiver → accepted |
| `decline_call` | p_call_id | Receiver → declined |
| `quick_reply_call` | p_call_id, p_reply | Sends canned message + declines |
| `end_call` | p_call_id | Either party → ended |
| `mark_call_missed` | p_call_id | Ringing → missed + missed_call notification |

## Triggers

- `saved_posts` / `saved_shots` insert/delete → maintain `save_count`.
- `messages` insert (kind post/shot) → bump target `share_count`.
- `handle_new_user` → seeds a `profiles` row on signup.
- `touch_conversation` → updates `conversations.last_message_at` on new message.

## Storage buckets

| Bucket | Public | Limit | MIME |
|---|---|---|---|
| `avatars` | yes | 5 MB | image/jpeg, png, webp |
| `post-images` | yes | 10 MB | image/jpeg, png, webp |
| `shot-media` | yes | 50 MB | video/mp4, webm, quicktime |
| `show-media` | yes | 25 MB | image + video |

## RLS summary

All tables have RLS enabled. Reads are scoped to the owner or conversation
members; writes require `auth.uid()` ownership. Notifications can be inserted by
authenticated users (used by client-side follow inserts and RPCs) and
selected/updated only by their owner. Calls are visible only to caller/receiver.

## Indexes

Hot-path indexes exist on: posts/shots `(created_at desc)` and `(user_id)`;
notifications `(user_id, is_read, created_at desc)`; conversations
`(last_message_at desc)`; conversation_members `(conversation_id, user_id)`;
messages `(conversation_id, created_at desc)`; hypes `(target_type, target_id)`
and `(user_id, target_type, target_id)`; saves/follows/comments lookups.

## Terminology

- **Hype** = like · **Shot** = short video reel · **Show** = 24h story (a
  separate feature from Shots) · **Discover** = explore.
