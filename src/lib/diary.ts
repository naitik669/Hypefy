/**
 * Pages — a 24-hour note, one per person, for your mutual circle, on the
 * Spotlight screen. Called "Diary" in the code, where it was built; people
 * see "Spotlight" for the screen and "page" for each note.
 *
 * Built on the `notes` table rather than beside it. That table already is
 * exactly this: one row per user, a 24-hour expiry, an audience of mutuals or
 * close friends, an optional song, a get_notes() RPC that returns yours first
 * and then the people you may see, blocks honoured both ways, and reactions
 * that notify the owner. What was missing was a place to read them — the old
 * surface was a bubble on a profile, which is switched off.
 *
 * So "Spotlight" is the name of the screen, "page" of what is on it, and
 * "note" stays the name of the row.
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
  /** The page colour they picked (a DIARY_COLORS key), or null for the default. */
  color: string | null;
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
  color?: string | null;
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
    color: r.color ?? null,
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

/* ─── Who reacted to yours ─────────────────────────────────────────────── */

export type DiaryReaction = {
  userId: string;
  emoji: string;
  at: string;
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
};

/**
 * Reactions to YOUR current Diary, newest first.
 *
 * Only reactions whose note_created_at matches the Diary on screen: a
 * reaction row is kept per person, not per Diary, and is overwritten when
 * they react again — so without the match, yesterday's "❤️" would show under
 * today's page from someone who has not seen it.
 */
export const REACTIONS_SELECT =
  "emoji, created_at, reactor_id, profiles!note_reactions_reactor_id_fkey(display_name, username, avatar_hue, avatar_url)";

type ReactionRow = {
  emoji: string;
  created_at: string;
  reactor_id: string;
  profiles:
    | { display_name: string | null; username: string | null; avatar_hue: number | null; avatar_url: string | null }
    | { display_name: string | null; username: string | null; avatar_hue: number | null; avatar_url: string | null }[]
    | null;
};

export function toReactions(rows: ReactionRow[] | null | undefined): DiaryReaction[] {
  return (rows ?? [])
    .map((r) => {
      const p = Array.isArray(r.profiles) ? (r.profiles[0] ?? null) : r.profiles;
      return {
        userId: r.reactor_id,
        emoji: r.emoji,
        at: r.created_at,
        name: p?.display_name ?? p?.username ?? "Someone",
        username: p?.username ?? null,
        hue: p?.avatar_hue ?? 280,
        avatarUrl: p?.avatar_url ?? null,
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** The star a hype shows as, beside the emoji people sent. */
export const HYPE = "⭐";

/**
 * Hypes on YOUR current page, as reactions with the star for an emoji — so
 * the tally and the who-sent-what list take both without a second shape.
 * Matched to the page on screen by note_created_at, like reactions.
 */
export const HYPES_SELECT =
  "created_at, note_created_at, hyper_id, profiles!note_hypes_hyper_id_fkey(display_name, username, avatar_hue, avatar_url)";

type HypeRow = Omit<ReactionRow, "emoji" | "reactor_id"> & { hyper_id: string };

export function toHypes(rows: HypeRow[] | null | undefined): DiaryReaction[] {
  return toReactions((rows ?? []).map((r) => ({ ...r, emoji: HYPE, reactor_id: r.hyper_id })));
}

/**
 * Which reactions on your page have already flown in. They fly up over your
 * page the first time you see them, not every time you open Pages; kept on
 * the device per page (its created_at), holding the newest one seen.
 */
const FLOWN_KEY = "hypefy:pages:flown";

export function newReactions(page: string, all: DiaryReaction[]): DiaryReaction[] {
  let seen: { page?: string; at?: string } = {};
  try {
    seen = JSON.parse(localStorage.getItem(FLOWN_KEY) ?? "{}") ?? {};
  } catch {
    /* nothing stored, or storage unavailable: everything is new */
  }
  const since = seen.page === page ? (seen.at ?? "") : "";
  return all.filter((r) => r.at > since);
}

export function markReactionsFlown(page: string, all: DiaryReaction[]) {
  const at = all.reduce((m, r) => (r.at > m ? r.at : m), "");
  try {
    localStorage.setItem(FLOWN_KEY, JSON.stringify({ page, at }));
  } catch {
    /* private mode: they fly again next time, which is harmless */
  }
}

/** "❤️ 3 · 😂 1", most-used first — the summary line under your page. */
export function reactionSummary(rs: DiaryReaction[]): { emoji: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rs) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  return [...counts]
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count);
}

/* ─── Your archive ─────────────────────────────────────────────────────── */

export type ArchivedDiary = {
  text: string;
  audience: "mutual" | "close";
  track: Track | null;
  writtenAt: string;
  endedHow: "replaced" | "taken_down" | "expired";
  color: string | null;
};

type ArchiveRow = {
  text: string;
  audience: string;
  track: unknown;
  written_at: string;
  ended_how: string;
  color?: string | null;
};

export function toArchive(rows: ArchiveRow[] | null | undefined): ArchivedDiary[] {
  return (rows ?? []).map((r) => ({
    text: r.text,
    audience: r.audience === "close" ? "close" : "mutual",
    track: asTrack(r.track),
    writtenAt: r.written_at,
    endedHow:
      r.ended_how === "replaced" || r.ended_how === "taken_down" ? r.ended_how : "expired",
    color: r.color ?? null,
  }));
}

/* ─── Stories ──────────────────────────────────────────────────────────── */

/** How long one Diary stays on screen before the next, when not held. */
export const STORY_MS = 6000;

/**
 * The order Diaries play in: ones you have not seen first, then newest. The
 * same order as the grid, so tapping the third card and swiping on reaches
 * the fourth — never a Diary the grid put somewhere else.
 */
export function storyOrder<T extends { userId: string; createdAt: string; isSelf?: boolean }>(
  entries: T[],
  fresh: ReadonlySet<string>
): T[] {
  return entries
    .filter((e) => !e.isSelf)
    .sort((a, b) => {
      const fa = fresh.has(a.userId) ? 1 : 0;
      const fb = fresh.has(b.userId) ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

/**
 * Where "next" and "back" go. Past the last Diary is the end of the run
 * (null closes the viewer); back on the first stays on the first rather
 * than closing — a tap on the left edge is rarely a request to leave.
 */
export function stepStory(index: number, count: number, dir: 1 | -1): number | null {
  if (count <= 0) return null;
  const next = index + dir;
  if (next >= count) return null;
  return Math.max(0, next);
}

/* ─── The stack ────────────────────────────────────────────────────────── */

/**
 * The deck after the top card is swiped away: it goes to the back and the
 * next comes up. Swiping the other way (-1) brings the back card to the top,
 * so a card swiped by mistake is one swipe from coming back.
 */
export function cycleDeck<T>(deck: T[], dir: 1 | -1 = 1): T[] {
  if (deck.length < 2) return deck;
  return dir === 1 ? [...deck.slice(1), deck[0]] : [deck[deck.length - 1], ...deck.slice(0, -1)];
}

/**
 * Each card's own lean, in degrees — the same for a given person every time,
 * so a card does not change its tilt as the deck moves. Alternates in sign
 * by a hash of the id, between 2 and 5 degrees either way.
 */
export function cardTilt(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h >>>= 0;
  const size = 2 + (h % 7) * 0.5; // 2, 2.5 … 5
  return (h >> 3) % 2 === 0 ? -size : size;
}
