import { kv } from "@hypefy/core/kv";

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
    const raw = JSON.parse(kv().get(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// What had been watched when the reel was opened. Read once and held still:
// the order must not shift under someone as they watch. Dropped when the
// reel is left, so the next visit reads afresh.
let atOpen: SeenAtOpen | null = null;

/**
 * `account` is what the signed-in person's account has on record as watched
 * (shot_views), when the page could read it. It wins over this device's list.
 *
 * The device list marks a Shot once it has been on screen SEEN_AFTER_MS,
 * whether or not it ever played; shot_views only counts one that played
 * (recordWatch). A Shot that sat paused, buffering, or under a sheet was
 * "watched" here and unwatched there, so it was put after "You're all caught
 * up" while it had never been seen. The device list also never forgot what
 * "Clear watch history" forgot, and belonged to the browser, not the person:
 * a second account on the same browser inherited it. Null (signed out, or the
 * read failed) falls back to the device list.
 *
 * What was watched since this tab loaded is added to the account's record:
 * the page that read it may be an older render than the last visit, and a
 * Shot watched a minute ago must not come back as new.
 */
export function seenAtOpen(account?: readonly string[] | null): SeenAtOpen {
  atOpen ??= {
    ids: account ? new Set([...account, ...watchedThisTab]) : new Set(readIds()),
    day: Math.floor(Date.now() / 86_400_000),
  };
  return atOpen;
}

export function forgetSeenAtOpen() {
  atOpen = null;
}

/** Shots marked since this tab loaded. Memory only: see seenAtOpen. */
const watchedThisTab = new Set<string>();

export function markShotSeen(id: string) {
  watchedThisTab.add(id);
  try {
    const ids = readIds().filter((x) => x !== id);
    ids.push(id);
    kv().set(KEY, JSON.stringify(ids.slice(-SEEN_CAP)));
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

export type ChapterBreak = {
  /** New Shots watched before the card. */
  newCount: number;
  /** Already-watched Shots that follow it. */
  watchedCount: number;
  /** The Shot above the card, and the one below: the card shows both. */
  abovePoster: string | null;
  belowPoster: string | null;
};

/**
 * What the card between the new Shots and the watched ones says and shows.
 *
 * Counted over the Shots alone, never the reel as rendered: an ad spliced
 * in beside them is not a Shot anybody watched, and counting one would have
 * the card claim a Shot more than there was.
 */
export function chapterBreak<T extends { id: string; poster_url?: string | null }>(
  posts: readonly T[],
  caughtUpBefore: string | null,
): ChapterBreak {
  const at = caughtUpBefore ? posts.findIndex((p) => p.id === caughtUpBefore) : -1;
  if (at < 0) return { newCount: 0, watchedCount: 0, abovePoster: null, belowPoster: null };
  return {
    newCount: at,
    watchedCount: posts.length - at,
    abovePoster: posts[at - 1]?.poster_url ?? null,
    belowPoster: posts[at]?.poster_url ?? null,
  };
}
