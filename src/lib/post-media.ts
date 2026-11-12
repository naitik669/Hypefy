/**
 * What a post carries, slot by slot.
 *
 * A post used to be up to ten photos in `image_urls`, and that is still the
 * shape 28 files read. This adds one ordered list that can hold a video in
 * any position — `[photo, video, photo]` — without rewriting any of them:
 * `media` is the truth, and `image_url` / `image_urls` keep being written
 * with the photo slots so every existing reader keeps working untouched.
 *
 * Validation lives here and nowhere else, the way `readLayers` is the only
 * validator for a Show's stickers (0182). The column is plain JSONB with a
 * cheap structural CHECK on it; anything about meaning is this file's job,
 * because a half-valid slot must be dropped rather than half-drawn.
 */

import { MAX_SHOT_SECS } from "@/lib/shot-trim";

/** The two things a slot can be. */
export type PostSlotKind = "image" | "video";

export type PostImageSlot = { kind: "image"; url: string };

export type PostVideoSlot = {
  kind: "video";
  url: string;
  /** A frame from the clip, drawn while it is not playing. Null if capture failed. */
  poster: string | null;
  /** Seconds, after any trim. Null when it could not be measured. */
  duration: number | null;
};

export type PostSlot = PostImageSlot | PostVideoSlot;

/**
 * How many slots one post may carry.
 *
 * The same ten the photo composer has always allowed — this is a limit on
 * how much one post asks someone to swipe through, not on storage, so
 * letting a video raise it would make no sense.
 */
export const MAX_POST_SLOTS = 10;

/**
 * The longest clip a post may carry.
 *
 * Its own number, not an import of MAX_SHOT_SECS, even though both are 60
 * today: a Shot is the whole of what you are watching and a post's video
 * sits under a caption beside photos, so the two have every reason to move
 * apart later. The assertion below is what stops them drifting silently
 * while they are meant to agree.
 */
export const MAX_POST_VIDEO_SECS = 60;

/** The longest URL a slot will hold, matching the sticker model's cap. */
const MAX_URL = 2048;

/** A stored media URL, or null. Https only — these are our own buckets. */
function url(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > MAX_URL) return null;
  return clean.startsWith("https://") ? clean : null;
}

/** A clip's length, or null where there is not a usable one. */
function duration(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0 || value > MAX_POST_VIDEO_SECS) return null;
  return Math.round(value * 1000) / 1000;
}

/** One slot, or null if it is not one. */
function slot(raw: unknown): PostSlot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  const href = url(s.url);
  // No URL means nothing to draw, and a slot that draws nothing is worse
  // than one fewer slot: the carousel would show a blank page mid-swipe.
  if (!href) return null;

  if (s.kind === "image") return { kind: "image", url: href };
  if (s.kind === "video") {
    return { kind: "video", url: href, poster: url(s.poster), duration: duration(s.duration) };
  }
  // An unknown kind is left out rather than guessed at. Guessing from the
  // extension would mean a future audio or document slot silently rendering
  // as whichever of these two it least resembled.
  return null;
}

/**
 * A post's slots, read defensively.
 *
 * Anything malformed reads as fewer slots, never as a crash and never as a
 * blank page in the carousel.
 */
export function readPostMedia(raw: unknown): PostSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: PostSlot[] = [];
  for (const item of raw) {
    const one = slot(item);
    if (one) out.push(one);
    if (out.length >= MAX_POST_SLOTS) break;
  }
  return out;
}

/**
 * The slots for a post row, from `media` when it has one and from the photo
 * columns when it does not.
 *
 * Every post made before this has no `media`, and there is no migration
 * backfilling one — a row's photos are already perfectly described by
 * `image_urls`, so deriving the slots on read is both cheaper and impossible
 * to get half-done.
 */
export function postSlots(row: {
  media?: unknown;
  image_urls?: string[] | null;
  image_url?: string | null;
}): PostSlot[] {
  const stored = readPostMedia(row.media);
  if (stored.length) return stored;
  const urls = Array.isArray(row.image_urls) && row.image_urls.length
    ? row.image_urls
    : row.image_url
      ? [row.image_url]
      : [];
  return readPostMedia(urls.map((u) => ({ kind: "image", url: u })));
}

/** Just the photos, in order — what `image_urls` is written with. */
export function imageUrlsOf(slots: readonly PostSlot[]): string[] {
  return slots.filter((s): s is PostImageSlot => s.kind === "image").map((s) => s.url);
}

/**
 * The one still image that stands for the whole post.
 *
 * Used by every grid, tile, share card and embed. It prefers the first slot's
 * own picture rather than the first photo anywhere in the post, because the
 * cover should be what the post opens with — and for a video-first post that
 * is the clip's poster. Falling back to "first photo" would show a grid tile
 * that is not in the post's first position, and a video-only post would have
 * shown nothing at all.
 */
export function coverOf(slots: readonly PostSlot[]): string | null {
  const first = slots[0];
  if (!first) return null;
  if (first.kind === "image") return first.url;
  return first.poster ?? imageUrlsOf(slots)[0] ?? null;
}

export function hasVideo(slots: readonly PostSlot[]): boolean {
  return slots.some((s) => s.kind === "video");
}

/** Whether a post is a single clip and nothing else — the Shots-shaped case. */
export function isVideoOnly(slots: readonly PostSlot[]): boolean {
  return slots.length === 1 && slots[0].kind === "video";
}

/** Total seconds of video in a post, for "1 min" style labels. */
export function videoSecondsOf(slots: readonly PostSlot[]): number {
  return slots.reduce((n, s) => (s.kind === "video" ? n + (s.duration ?? 0) : n), 0);
}

/**
 * The two caps agree today. If one moves, this is the line that says so —
 * better a failing test than a composer that trims to 60 and a reader that
 * refuses at 45.
 */
export const POST_AND_SHOT_CAPS_AGREE = MAX_POST_VIDEO_SECS === MAX_SHOT_SECS;
