/**
 * What you last looked for in the song picker.
 *
 * On the device, not the account. A search is a half-finished thought —
 * "sad lofi", someone's name spelled wrong — and syncing those between
 * phones is a privacy cost with nothing on the other side of it. Losing
 * them on a new device is the right trade.
 */

const KEY = "hypefy:music:recent";
/** Kept. The picker shows the first few and opens the rest behind "See more". */
export const RECENT_MAX = 10;
/** Shown before "See more". */
export const RECENT_SHOWN = 3;

export function loadRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
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
  const next = [q, ...loadRecentSearches().filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A device that refuses storage still searches; it just forgets.
  }
  return next;
}

export function forgetSearches(): string[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — the list is already gone as far as the picker cares.
  }
  return [];
}
