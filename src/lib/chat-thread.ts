/**
 * The chat thread's own vocabulary: what a message is, and the small pure
 * questions the thread asks about one.
 *
 * Extracted from RealChatView, which had grown to 3,431 lines and was the
 * root cause of two shipped correctness bugs. Nothing here was changed in
 * the move — the file is the same code in a smaller room, which is why the
 * existing suite is the proof that the move was safe.
 *
 * Pure on purpose: no React, no Supabase client, no browser. The one piece
 * that could not come along is ATTACH_OPTIONS, which carries JSX icons and
 * so stays with the component.
 */

import { albumSnippet, parseAlbum, type Album } from "@/lib/chat-album";
import { isEncrypted } from "@/lib/e2ee/chat";
import { musicSnippet } from "@/lib/music-message";
import { one } from "@/lib/supabase/typed";

export type PostPreview = {
  id: string;
  /** Whose post it is — read so a forwarded comment's label can say "your post". */
  user_id?: string | null;
  caption: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  aspect_ratio?: number | null;
};
export type ShotPreview = { id: string; user_id?: string | null; media_url: string; poster_url?: string | null; caption: string | null };
export type ShareProfile = {
  username: string | null;
  display_name: string | null;
  avatar_hue: number | null;
  avatar_url?: string | null;
};

export type ChatMsg = {
  id: string;
  body: string | null;
  sender_id: string;
  kind: string;
  post_id: string | null;
  shot_id?: string | null;
  reply_to_id: string | null;
  is_unsent: boolean;
  edited_at?: string | null;
  created_at: string;
  /** When someone put this on the chat's pin board, if they did (0142). */
  pinned_at?: string | null;
  post?: PostPreview | null;
  postProfile?: ShareProfile | null;
  shot?: ShotPreview | null;
  shotProfile?: ShareProfile | null;
  /** claim_oneshot writes { oneshot_opened, oneshot_opened_at } here — the
   *  only channel the sender has for "did they open it yet", since the
   *  oneshots table itself is unreadable by any client. */
  metadata?: {
    oneshot_opened?: boolean;
    oneshot_opened_at?: string;
    /** A reply to someone's page: the page as it was, copied by send_page_reply. */
    page?: unknown;
    /** A shared post: which of its photos was shared (send_message, 0110). */
    slide?: number;
    /** A forwarded comment on that post or Shot (send_message, 0134). Only
     *  the id: the words are read live, so an edit follows it and a deleted
     *  one says so, rather than the chat keeping a copy for ever. */
    comment_id?: string;
  } | null;
  /** Client-only: set on optimistic messages before server confirms */
  _status?: "pending" | "failed";
  /** Client-only, end-to-end encryption: what happened when we tried to read
   *  this body. Absent means it was never encrypted. "open" means `body` now
   *  holds the plaintext while the database holds only the envelope. */
  _enc?: "open" | "locked";
  /** Client-only: the envelope we actually sent, kept on the optimistic copy
   *  so the realtime echo of our own message still matches it. */
  _cipher?: string;
  /** Client-only: the OneShot's private storage path, kept so a failed send
   *  can be retried without re-uploading. Never comes back from the server. */
  _storagePath?: string;
  /** Client-only, folders: the album drawn from this device's files while
   *  it uploads, so nothing reloads when the real URLs arrive. */
  _preview?: string;
  /** Client-only, single photo or video: the file on this device, drawn
   *  while it uploads and after, so the picture never reloads. */
  _localUrl?: string;
  _caption?: string;
};

export type MsgStatus = "pending" | "sent" | "seen" | "failed";

/**
 * One other participant's read state. A list rather than a scalar because a
 * group has no "the other person" — which is exactly why group read receipts
 * never appeared.
 */
export type Reader = {
  userId: string;
  lastReadAt: string | null;
  hideReadReceipts: boolean;
};

/**
 * Has everyone who could have read this message read it?
 *
 * Anyone with "Hide read receipts" on is left OUT of the test rather than
 * counted as unread — otherwise one member's privacy setting would
 * permanently withhold the tick from everyone else in the group. When they
 * are the only other participant there is nobody left to count, so the
 * message correctly never reads as seen.
 */
export function everyoneHasRead(readers: Reader[], createdAt: string): boolean {
  const counted = readers.filter((r) => !r.hideReadReceipts);
  if (counted.length === 0) return false;
  return counted.every((r) => !!r.lastReadAt && createdAt <= r.lastReadAt);
}

/** Width of a photo or video in the thread. */
export const MEDIA_W = 280;

/** A folder as drawn: the photos from this device while it has them, so they
 *  never reload, and the caption as it now stands, which an edit may change. */
export function albumOf(m: ChatMsg): Album | null {
  const shown = parseAlbum(m._preview ?? m.body);
  if (!shown) return null;
  const current = m._preview ? parseAlbum(m.body) : shown;
  return { ...shown, caption: current?.caption ?? shown.caption };
}

/** Short human snippet for quoting a message — never a raw URL. */
export function msgSnippet(m: { is_unsent?: boolean; kind: string; body: string | null }): string {
  if (m.is_unsent) return "Unsent message";
  // A body still in its envelope is one this device could not open. Quoting
  // the JSON would be worse than saying nothing.
  if (isEncrypted(m.body)) return "Encrypted message";
  switch (m.kind) {
    case "gif": return "GIF";
    case "image": return "Photo";
    case "video": return "Video";
    case "voice": return "Voice note";
    case "music": return musicSnippet(m.body);
    case "shot": return "Shot";
    case "post": return "Post";
    case "oneshot": return "Photo";
    case "album": return albumSnippet(m.body);
    case "page_reply": return m.body ? `Page reply: ${m.body}` : "Page reply";
    case "document": {
      try { return JSON.parse(m.body ?? "")?.name ?? "Document"; } catch { return "Document"; }
    }
    default: return m.body ?? "Message";
  }
}

export type ReactionRow = { message_id: string; user_id: string; emoji: string };
export type Other = { id: string; name: string; username: string | null; hue: number; avatarUrl?: string | null; lastSeenAt?: string | null; showActivity?: boolean; hideReadReceipts?: boolean; verified?: boolean; cosmetics?: { is_premium: boolean; name_font: string | null; name_glow: string | null; avatar_decoration: string | null } | null };
export type GroupMember = { id: string; name: string; username: string | null; hue: number; avatarUrl: string | null; role: string };
export type GroupMeta = { title: string; memberCount: number; avatarUrl?: string | null; members?: GroupMember[]; myRole?: string };

export const REPORT_REASONS = ["Spam", "Harassment", "Hate or abuse", "Scam", "Inappropriate content", "Other"];
export const QUICK = ["❤️", "🥰", "😂", "👍", "😮", "😢"];

/** Document mimes the chat-media bucket accepts (0034_chat_documents.sql).
 *  Kept in sync with that migration's allowlist — html/svg are deliberately
 *  absent since both can carry script. */
export const DOC_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
];
/** Extensions too — some platforms' file pickers match on those, not mime. */
export const DOC_ACCEPT = `${DOC_MIMES.join(",")},.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip`;

/** "2.4 MB" / "812 KB" — for document bubbles. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** How many messages per page (initial load + each scroll-up chunk). */
export const MSG_PAGE = 30;
/**
 * How many older pages to fetch while reaching for a search result.
 *
 * Bounded on purpose: a match from two years back would otherwise pull the
 * whole chat into the page to scroll to one line.
 */
export const SEARCH_REACH_PAGES = 12;
/** Select used for both the initial server load and client pagination. */
export const MSG_SELECT =
  "id, body, sender_id, kind, post_id, shot_id, reply_to_id, is_unsent, metadata, created_at, pinned_at, post:posts(id, user_id, caption, image_url, image_urls, aspect_ratio, profiles!posts_user_id_fkey(username, display_name, avatar_hue, avatar_url)), shot:shots(id, user_id, media_url, poster_url, caption, profiles(username, display_name, avatar_hue, avatar_url))";

/** Flatten Supabase's nested post/shot+profile joins into ChatMsg shape. */
export function mapMessageRow(m: any): ChatMsg {
  const profOf = (x: any) => { const p = one<any>(x); return p ? one<any>(p.profiles) : null; };
  return {
    ...m,
    post: m.post ? { ...one(m.post), profiles: undefined } : null,
    postProfile: m.post ? profOf(m.post) : null,
    shot: m.shot ? { ...one(m.shot), profiles: undefined } : null,
    shotProfile: m.shot ? profOf(m.shot) : null,
  };
}

/**
 * Does this message carry its sender's face?
 *
 * Only someone else's, and only the LAST of a run of theirs: one face at the
 * foot of what a person said, not one on every bubble. A run ends when the
 * next message is from someone else, is a notice from the thread itself, or
 * is on another day. Exported for tests.
 */
export function showsFace(
  m: { sender_id: string; kind: string; created_at: string },
  next: { sender_id: string; kind: string; created_at: string } | undefined,
  currentUserId: string,
): boolean {
  if (m.sender_id === currentUserId || m.kind === "system") return false;
  return !next || next.kind === "system" || next.sender_id !== m.sender_id || !sameDay(next.created_at, m.created_at);
}

/** Kinds whose time is written under the card, not inside the bubble. */
export const TIME_BELOW = new Set(["voice", "document", "album", "page_reply", "post", "shot"]);

/**
 * How far to raise the face so it sits level with the bubble's bottom edge,
 * in pixels.
 *
 * The face is lined up with the bottom of everything a message draws, and
 * two things can hang under the bubble: a reaction chip, which bites into
 * the bubble's edge and hangs 11px below it (21px tall, overlapping by 10), and, for cards, a
 * line with the time. Left alone, the face dropped beside those instead of
 * beside the words. Exported for tests.
 */
export function faceLift(m: { kind: string }, hasReactions: boolean, showTime: boolean): number {
  const REACTION = 11;
  const TIME_LINE = 17;
  return (hasReactions ? REACTION : 0) + (showTime && TIME_BELOW.has(m.kind) ? TIME_LINE : 0);
}

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
export function sameDay(a: string, b: string) {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}
export function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  if (diff > 1 && diff < 7)
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}
