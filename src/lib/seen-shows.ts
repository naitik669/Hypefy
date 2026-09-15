/**
 * Shows you've watched on this device, so the green ring goes the same way
 * everywhere: on Home and on profiles. The viewer records every Show as it
 * opens; Home's row and the profile avatar both read from here. Your own
 * Shows are only known here (watching your own isn't a view).
 */
const STORAGE_KEY = "hypefy_seen_shows";
const EVENT = "hypefy:seen-shows";

export function readSeenShows(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function markShowSeen(id: string) {
  const seen = readSeenShows();
  if (seen.has(id)) return;
  seen.add(id);
  try {
    // Newest last; keep it from growing forever (Shows last a day anyway).
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen].slice(-500)));
  } catch {
    // Storage blocked: the ring comes back on reload, nothing worse.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Call `fn` whenever a Show is marked seen in this tab. */
export function onSeenShowsChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
