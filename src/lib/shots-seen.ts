/**
 * Which Shots this person has already watched, and what that does to the
 * order of the reel.
 *
 * With few Shots on Hypefy, opening the reel used to replay the same ones
 * from the top every time, and then stop dead. Remembering what was watched
 * lets the reel put what is new first, say "you're caught up" at the point
 * where it runs out of new, and still offer the earlier ones after that.
 *
 * Kept on the device: it is about this screen's order, not a record of
 * viewing, and nothing else reads it. A new phone starts fresh.
 */

const KEY = "hypefy_shots_seen";
/** How many are remembered; the oldest fall off. */
export const SEEN_CAP = 600;
/** A Shot counts as watched once it has been on screen this long. */
export const SEEN_AFTER_MS = 1500;
/** Fewer Shots than this in the reel, and the end of it asks for one. */
export const THIN_REEL = 20;

export type SeenAtOpen = {
  ids: ReadonlySet<string>;
  /** Changes once a day: the order of an all-watched reel differs by day, and holds within one. */
  day: number;
};

function readIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// What had been watched when the reel was opened. Read once and held still:
// the order must not shift under someone as they watch. Dropped when the
// reel is left, so the next visit reads afresh.
let atOpen: SeenAtOpen | null = null;

export function seenAtOpen(): SeenAtOpen {
  atOpen ??= { ids: new Set(readIds()), day: Math.floor(Date.now() / 86_400_000) };
  return atOpen;
}

export function forgetSeenAtOpen() {
  atOpen = null;
}

export function markShotSeen(id: string) {
  try {
    const ids = readIds().filter((x) => x !== id);
    ids.push(id);
    localStorage.setItem(KEY, JSON.stringify(ids.slice(-SEEN_CAP)));
  } catch {
    /* private mode: the reel simply does not remember */
  }
}

/** A small stable number from a string, for an order that is arbitrary but repeatable. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The same items in an order decided by `seed`: different seed, different order. */
export function shuffled<T extends { id: string }>(items: T[], seed: number | string): T[] {
  return [...items].sort((a, b) => hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`) || a.id.localeCompare(b.id));
}

export type ReelOrder<T> = {
  items: T[];
  /**
   * The first already-watched Shot, when there are new ones before it and
   * watched ones after: the "you're caught up" card goes just above it.
   * Null when the reel is all new or all watched.
   */
  caughtUpBefore: string | null;
};

/**
 * The order the reel plays in.
 *
 *   - Some new, some watched: the new ones first, in the order they were
 *     ranked; then the watched ones.
 *   - All watched: every one of them, in an order that changes by the day,
 *     so tomorrow's visit is not today's again.
 *   - `round` above 0 is "Watch again": everything, reshuffled, no marker.
 */
export function orderReel<T extends { id: string }>(items: T[], seen: SeenAtOpen, round = 0): ReelOrder<T> {
  if (round > 0) return { items: shuffled(items, `again-${round}`), caughtUpBefore: null };
  const fresh = items.filter((x) => !seen.ids.has(x.id));
  const watched = items.filter((x) => seen.ids.has(x.id));
  if (fresh.length === 0) return { items: shuffled(watched, `day-${seen.day}`), caughtUpBefore: null };
  return { items: [...fresh, ...watched], caughtUpBefore: watched[0]?.id ?? null };
}
