import { readJson, writeJson } from "@hypefy/core/kv";

/**
 * Recently-seen post ids — a capped ring in the device's key-value store.
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
 *
 * The store it reads is whichever one the client installed — localStorage on
 * the web, MMKV on native — so the ring follows the device rather than the
 * platform. What went in the move is a `typeof window` guard and a try/catch
 * around each call, both of which the store now owns.
 */

const SEEN_KEY = "hypefy_feed_seen";
const SEEN_CAP = 500;

/**
 * A stored ring is a list of ids and nothing else.
 *
 * It used to be cast — `as string[]` — which is a claim rather than a check:
 * a stored value from another version, or junk that happens to parse, went
 * straight into a Set and out to a caller that paged on it. readJson wants
 * the check, so here it is.
 */
function isIdList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function loadSeen(): Set<string> {
  return new Set(readJson(SEEN_KEY, isIdList, []));
}

export function saveSeen(seen: Set<string>) {
  // Newest kept: the tail of the insertion order, which is the end of the
  // Set. An older entry falling off is the point of the cap.
  writeJson(SEEN_KEY, [...seen].slice(-SEEN_CAP));
}
