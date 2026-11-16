import { kv, readJson, writeJson } from "@hypefy/core/kv";

/**
 * What you last looked for in the song picker.
 *
 * On the device, not the account. A search is a half-finished thought —
 * "sad lofi", someone's name spelled wrong — and syncing those between
 * phones is a privacy cost with nothing on the other side of it. Losing
 * them on a new device is the right trade.
 *
 * Moved into the core behind the Kv interface: the behaviour is unchanged
 * and its tests were not touched. What went is the plumbing — a
 * `typeof window` guard and a try/catch around each of the three calls,
 * which the store now owns. That is the point of the interface, and it is
 * what lets this file read as what it is about.
 */

const KEY = "hypefy:music:recent";
/** Kept. The picker shows the first few and opens the rest behind "See more". */
export const RECENT_MAX = 10;
/** Shown before "See more". */
export const RECENT_SHOWN = 3;

/** A stored list is only a list of strings; anything else reads as empty. */
function isStringList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function loadRecentSearches(): string[] {
  return readJson(KEY, isStringList, []).slice(0, RECENT_MAX);
}

/**
 * Remember one, newest first and without repeats.
 *
 * Matching is case-insensitive and trimmed, so "Doja Cat" typed twice is
 * one entry rather than two that look identical in the list. Returns the
 * new list so a caller can set state without reading back.
 */
export function rememberSearch(query: string): string[] {
  const q = query.trim();
  if (!q) return loadRecentSearches();
  const next = [
    q,
    ...loadRecentSearches().filter((r) => r.toLowerCase() !== q.toLowerCase()),
  ].slice(0, RECENT_MAX);
  writeJson(KEY, next);
  return next;
}

export function forgetSearches(): string[] {
  kv().remove(KEY);
  return [];
}
