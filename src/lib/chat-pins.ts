import { parseAlbum } from "@/lib/chat-album";
import { unpackTrack } from "@/lib/music-message";
import type { Track } from "@/lib/music";
import { hash } from "@/lib/card-remarks";

/**
 * A conversation's pin board: the things in a chat worth keeping where both
 * people can find them.
 *
 * Pure. The page reads the rows; this decides what each one is, which side
 * of the board it hangs on, and how far it leans. Kept out of the component
 * so the rules can be tested without a chat.
 */

/** Must match `public.max_pinned_messages()` in 0142. */
export const MAX_PINNED_MESSAGES = 30;

/**
 * What may be pinned.
 *
 * Not `system` — nobody wants "Aman joined" on the board. Not `oneshot`: it
 * is a message that exists to be seen once and then be gone, and a pin is a
 * promise to keep something, so the two cannot both be honoured. The database
 * refuses these as well, so this list is the explanation rather than the
 * enforcement.
 */
export const PINNABLE_KINDS = [
  "text",
  "image",
  "video",
  "gif",
  "album",
  "voice",
  "music",
  "document",
  "post",
  "shot",
  "page_reply",
];

export function canPin(kind: string, isUnsent: boolean): boolean {
  return !isUnsent && PINNABLE_KINDS.includes(kind);
}

/** A message row as the pins page selects it. */
export type PinRow = {
  id: string;
  kind: string;
  body: string | null;
  sender_id: string;
  created_at: string;
  pinned_at: string | null;
  pinned_by: string | null;
  post?: unknown;
  shot?: unknown;
};

/**
 * What a card on the board draws.
 *
 * One shape per way of looking at a thing, not one per message kind: a photo
 * and a video are the same card with the frame told which it is, and a GIF is
 * a photo that moves. The shapes exist so the board has a handful of layouts
 * instead of thirteen.
 */
export type PinCard =
  | { shape: "photo"; url: string; motion: boolean; more: number }
  | { shape: "note"; text: string }
  | { shape: "voice"; url: string; duration: number | null; peaks: number[] | null }
  | {
      shape: "share";
      of: "post" | "shot";
      targetId: string | null;
      thumb: string | null;
      video: string | null;
      username: string | null;
    }
  | { shape: "track"; track: Track }
  | { shape: "file"; url: string; name: string; size: number | null };

export type Pin = {
  /** The message. Tapping a card goes back to it in the thread. */
  id: string;
  senderId: string;
  /** Sent by the reader, which is what puts it on the right. */
  mine: boolean;
  at: string;
  pinnedAt: string;
  pinnedBy: string | null;
  /** The small mono line under the card: SHOT, VOICE · 0:24, MESSAGE. */
  label: string;
  /** Mine right, everyone else's left — the thread's own grammar. */
  side: "left" | "right";
  /** Degrees, deterministic from the id so a card never moves on its own. */
  tilt: number;
  card: PinCard;
};

/** Voice notes and documents pack their details into the body as JSON; old rows hold a bare URL. */
function unpack(body: string | null): Record<string, unknown> & { url: string } {
  if (!body) return { url: "" };
  try {
    const raw = JSON.parse(body) as Record<string, unknown>;
    if (raw && typeof raw === "object" && typeof raw.url === "string") {
      return raw as Record<string, unknown> & { url: string };
    }
  } catch {
    /* a bare URL */
  }
  return { url: body };
}

const one = <T,>(v: unknown): T | null => ((Array.isArray(v) ? v[0] : v) as T | null) ?? null;

/**
 * How far a card leans, in degrees.
 *
 * Drawn from the message id, so the board looks hand-pinned but never
 * reshuffles: the same card leans the same way on every render, after a
 * reload, and on the other person's phone. Random tilt was the first thing
 * tried and it jittered on every re-render, which read as a glitch.
 *
 * Small on purpose. Past about three degrees the text starts to look broken
 * rather than casual, and a column of cards all leaning hard reads as a
 * mistake in the layout.
 */
export const TILT_MAX = 2.6;

export function pinTilt(id: string): number {
  // 0..1 from the hash, then spread across [-TILT_MAX, TILT_MAX] and held to
  // one decimal so the transform string is stable and short.
  const t = (hash(id) % 1000) / 999;
  return Math.round((t * 2 - 1) * TILT_MAX * 10) / 10;
}

/** "0:24". */
function clock(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;
}

/** The mono caption: what the thing is, and for a voice note how long. */
export function pinLabel(card: PinCard, kind: string): string {
  switch (card.shape) {
    case "photo":
      if (card.more > 0) return `${card.more + 1} PHOTOS`;
      if (kind === "gif") return "GIF";
      return card.motion ? "VIDEO" : "PHOTO";
    case "voice":
      return card.duration ? `VOICE · ${clock(card.duration)}` : "VOICE NOTE";
    case "share":
      return card.of === "shot" ? "SHOT" : "POST";
    case "track":
      return "MUSIC";
    case "file":
      return "FILE";
    case "note":
      return kind === "page_reply" ? "PAGE REPLY" : "MESSAGE";
  }
}

/** What one row draws, or null when there is nothing left of it to show. */
function cardFor(m: PinRow): PinCard | null {
  if (m.kind === "album") {
    const items = parseAlbum(m.body)?.items ?? [];
    const first = items[0];
    if (!first) return null;
    return { shape: "photo", url: first.url, motion: first.type === "video", more: items.length - 1 };
  }
  if (m.kind === "image" || m.kind === "video" || m.kind === "gif") {
    if (!m.body) return null;
    return { shape: "photo", url: m.body, motion: m.kind === "video", more: 0 };
  }
  if (m.kind === "voice") {
    const v = unpack(m.body);
    if (!v.url) return null;
    return {
      shape: "voice",
      url: v.url,
      duration: typeof v.duration === "number" ? v.duration : null,
      peaks: Array.isArray(v.peaks) ? (v.peaks as number[]) : null,
    };
  }
  if (m.kind === "document") {
    const d = unpack(m.body);
    if (!d.url) return null;
    return {
      shape: "file",
      url: d.url,
      name: typeof d.name === "string" && d.name ? d.name : "Document",
      size: typeof d.size === "number" ? d.size : null,
    };
  }
  if (m.kind === "music") {
    const track = unpackTrack(m.body);
    return track ? { shape: "track", track } : null;
  }
  if (m.kind === "post") {
    const p = one<{ id: string; image_url?: string | null; image_urls?: string[] | null; profiles?: unknown }>(m.post);
    return {
      shape: "share",
      of: "post",
      targetId: p?.id ?? null,
      thumb: p?.image_urls?.[0] ?? p?.image_url ?? null,
      video: null,
      username: one<{ username?: string | null }>(p?.profiles)?.username ?? null,
    };
  }
  if (m.kind === "shot") {
    const s = one<{ id: string; media_url?: string | null; poster_url?: string | null; profiles?: unknown }>(m.shot);
    const isVideo = !!s?.media_url && !/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(s.media_url);
    return {
      shape: "share",
      of: "shot",
      targetId: s?.id ?? null,
      thumb: s?.poster_url ?? (isVideo ? null : (s?.media_url ?? null)),
      video: !s?.poster_url && isVideo ? (s?.media_url ?? null) : null,
      username: one<{ username?: string | null }>(s?.profiles)?.username ?? null,
    };
  }
  // text, page_reply, and anything new: the words themselves.
  const text = (m.body ?? "").trim();
  return text ? { shape: "note", text } : null;
}

/**
 * The board, newest pin first.
 *
 * Ordered by when it was pinned rather than when it was sent: the board is a
 * record of what people chose to keep, and a photo from March pinned today
 * belongs at the top with the rest of today's thinking.
 */
export function toPins(rows: PinRow[], me: string): Pin[] {
  const pins: Pin[] = [];
  for (const m of rows) {
    if (!m.pinned_at) continue;
    const card = cardFor(m);
    if (!card) continue;
    const mine = m.sender_id === me;
    pins.push({
      id: m.id,
      senderId: m.sender_id,
      mine,
      at: m.created_at,
      pinnedAt: m.pinned_at,
      pinnedBy: m.pinned_by,
      label: pinLabel(card, m.kind),
      side: mine ? "right" : "left",
      tilt: pinTilt(m.id),
      card,
    });
  }
  return pins.sort((a, b) => (a.pinnedAt < b.pinnedAt ? 1 : a.pinnedAt > b.pinnedAt ? -1 : 0));
}

/** "1.2 MB", "340 KB". */
export function fileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "Tue", "14 Oct", "14 Oct 2025" — as much as is needed to place it. */
export function pinWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 7) return d.toLocaleDateString("en", { weekday: "short" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("en", { day: "numeric", month: "short" });
  return d.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * How far a leftward swipe must travel to open the pin board.
 *
 * The thread is the one screen in the app with no sideways navigation of its
 * own — SwipeNav only moves between the five tabs, and a chat is a sub-route
 * it deliberately leaves alone — so this gesture is free to mean one thing.
 */
export const PIN_SWIPE_PX = 70;

/**
 * Does this released drag open the pin board?
 *
 * Leftward only: rightward over a chat reads as going back. Clearly sideways,
 * because the thread under the finger scrolls, and stealing a scroll is worse
 * than missing a swipe — the same bias SwipeNav takes.
 */
export function opensPinBoard(dx: number, dy: number): boolean {
  return dx <= -PIN_SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.6;
}

/** The columns the pin board reads. */
export const PIN_SELECT =
  "id, kind, body, sender_id, created_at, pinned_at, pinned_by, post:posts(id, image_url, image_urls, profiles!posts_user_id_fkey(username)), shot:shots(id, media_url, poster_url, profiles(username))";
