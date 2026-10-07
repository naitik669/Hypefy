/**
 * When to point at the Spotlight deck.
 *
 * Spotlight is a small deck tucked at the edge of Messages, with no label.
 * A note with an arrow says what it is. Who sees it, and how often:
 *
 *   - someone who has not put a page on Spotlight in the last week sees it
 *     (which, the first time, is nearly everyone);
 *   - then only now and then, days apart, and only a few times in all;
 *   - someone who has posted in the last week does not see it at all;
 *   - posting starts it over: lapse for a week again and it may come back.
 *
 * Kept on the device. It is a courtesy, not a record, so "has not posted"
 * means "this phone has not seen you post".
 */

export type SpotlightUse = {
  /** When their own page was last seen up (ms), or null if never. */
  postedAt: number | null;
  /** When the note was last shown (ms), or null. */
  shownAt: number | null;
  /** How many times it has been shown since they last posted. */
  shows: number;
};

export const NEVER_USED: SpotlightUse = { postedAt: null, shownAt: null, shows: 0 };

const DAY = 24 * 60 * 60 * 1000;
/** Posted within this long: they know what the deck is. */
export const POSTED_LATELY_MS = 7 * DAY;
/** At least this long between two showings. */
export const POINT_GAP_MS = 4 * DAY;
/** "A few times": after this many, it stops until they post and lapse again. */
export const POINT_LIMIT = 4;

const KEY = "hypefy_spotlight_use";

export function readSpotlightUse(): SpotlightUse {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<SpotlightUse> | null;
    return {
      postedAt: typeof p?.postedAt === "number" ? p.postedAt : null,
      shownAt: typeof p?.shownAt === "number" ? p.shownAt : null,
      shows: typeof p?.shows === "number" && p.shows > 0 ? Math.floor(p.shows) : 0,
    };
  } catch {
    // Private mode: behave as though they post, so nothing nags.
    return { postedAt: Date.now(), shownAt: null, shows: 0 };
  }
}

function write(use: SpotlightUse) {
  try {
    localStorage.setItem(KEY, JSON.stringify(use));
  } catch {
    /* nothing to do */
  }
}

/** Should the note be shown now? */
export function shouldPoint(use: SpotlightUse, now: number): boolean {
  if (use.postedAt !== null && now - use.postedAt < POSTED_LATELY_MS) return false;
  if (use.shows >= POINT_LIMIT) return false;
  if (use.shownAt !== null && now - use.shownAt < POINT_GAP_MS) return false;
  return true;
}

/** Their own page is up, posted at `at`: remembered, and the count starts over. */
export function withPosted(use: SpotlightUse, at: number): SpotlightUse {
  if (use.postedAt !== null && at <= use.postedAt) return use;
  return { postedAt: at, shownAt: null, shows: 0 };
}

export function withPointed(use: SpotlightUse, now: number): SpotlightUse {
  return { ...use, shownAt: now, shows: use.shows + 1 };
}

/** Their own page, as an ISO time, was seen up. */
export function noteSpotlightPosted(createdAt: string | null | undefined) {
  const at = createdAt ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(at)) return;
  const before = readSpotlightUse();
  const after = withPosted(before, at);
  if (after !== before) write(after);
}

export function noteSpotlightPointed(now = Date.now()) {
  write(withPointed(readSpotlightUse(), now));
}
