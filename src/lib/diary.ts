/**
 * Diary — a 24-hour note, one per person, for your mutual circle.
 *
 * Built on the `notes` table rather than beside it. That table already is
 * exactly this: one row per user, a 24-hour expiry, an audience of mutuals or
 * close friends, an optional song, a get_notes() RPC that returns yours first
 * and then the people you may see, blocks honoured both ways, and reactions
 * that notify the owner. What was missing was a place to read them — the old
 * surface was a bubble on a profile, which is switched off.
 *
 * So "Diary" is the name of the surface, and "note" stays the name of the row.
 */

import type { Track } from "@/lib/music";

export const DIARY_HOURS = 24;

export type DiaryEntry = {
  userId: string;
  text: string;
  audience: "mutual" | "close";
  createdAt: string;
  isSelf: boolean;
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
  track: Track | null;
};

/** Shape get_notes() returns. Kept loose: the RPC's typing is generated. */
type NoteRow = {
  user_id: string;
  text: string;
  audience: string;
  created_at: string;
  is_self: boolean;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
  track: unknown;
};

function asTrack(v: unknown): Track | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  // set_note refuses a track without these three, so anything missing one is
  // not a track this app wrote.
  if (typeof t.id !== "string" || typeof t.title !== "string" || typeof t.preview !== "string") {
    return null;
  }
  return v as Track;
}

export function toDiaryEntries(rows: NoteRow[] | null | undefined): DiaryEntry[] {
  return (rows ?? []).map((r) => ({
    userId: r.user_id,
    text: r.text,
    audience: r.audience === "close" ? "close" : "mutual",
    createdAt: r.created_at,
    isSelf: r.is_self,
    name: r.display_name ?? r.username ?? "Someone",
    username: r.username,
    hue: r.avatar_hue ?? 280,
    avatarUrl: r.avatar_url,
    track: asTrack(r.track),
  }));
}

/**
 * "18h left", "40m left", "ending".
 *
 * Derived from created_at rather than read from expires_at, which get_notes
 * does not return — set_note always sets it to exactly created_at + 24h.
 */
export function timeLeft(createdAt: string, now = Date.now()): string {
  const ends = new Date(createdAt).getTime() + DIARY_HOURS * 3_600_000;
  const ms = ends - now;
  if (!(ms > 0)) return "ending";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `${h}h left`;
  const m = Math.max(1, Math.floor(ms / 60_000));
  return `${m}m left`;
}

/* ─── Seen tracking ──────────────────────────────────────────────────────
 *
 * Which diaries you have already looked at, so the Messages icon can say how
 * many are new. Kept on the device, keyed by the diary's created_at rather
 * than a flag, because a diary is replaced in place: the same person writing
 * a new one keeps their user id but gets a new created_at, and that has to
 * count as new again. No table, no migration, nothing to clean up — the map
 * is pruned to people who currently have a diary every time it is written.
 */

const SEEN_KEY = "hypefy:diary:seen";

export type SeenMap = Record<string, string>;

export function loadSeen(): SeenMap {
  if (typeof window === "undefined") return {};
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
    return v && typeof v === "object" ? (v as SeenMap) : {};
  } catch {
    return {};
  }
}

/** Mark every given diary seen, forgetting anyone who no longer has one. */
export function markSeen(entries: Pick<DiaryEntry, "userId" | "createdAt">[]) {
  const next: SeenMap = {};
  for (const e of entries) next[e.userId] = e.createdAt;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    /* private mode, quota — the badge just stays up, which is harmless */
  }
}

/** Other people's diaries you have not looked at since they were written. */
export function unseen<T extends { userId: string; createdAt: string; isSelf?: boolean }>(
  entries: T[],
  seen: SeenMap
): T[] {
  return entries.filter((e) => !e.isSelf && seen[e.userId] !== e.createdAt);
}
