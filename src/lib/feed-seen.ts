/**
 * Recently-seen post ids — a capped ring in localStorage.
 *
 * Two consumers, which is why it lives here rather than inside FeedList:
 *
 *  - `FeedList` skips these when paging the chronological tail, so the same
 *    posts don't reappear across sessions.
 *  - The in-feed nudges use the ring's SIZE as a cheap "has this person
 *    actually used the app" signal. It measures scrolling, not app launches,
 *    and needs no counter, no new key and no table.
 *
 * Per-device by nature. A user on a second device looks new to it, which is
 * fine for both uses.
 */

const SEEN_KEY = "hypefy_feed_seen";
const SEEN_CAP = 500;

export function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(
      JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[],
    );
  } catch {
    return new Set();
  }
}

export function saveSeen(seen: Set<string>) {
  try {
    const arr = [...seen].slice(-SEEN_CAP);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {
    /* quota / private mode, non-fatal */
  }
}

