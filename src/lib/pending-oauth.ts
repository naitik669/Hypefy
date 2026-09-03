/**
 * Work that has to survive a full-page OAuth redirect.
 *
 * signInWithOAuth navigates away, so nothing after the call ever runs. Two
 * things used to be lost that way:
 *
 *  - The age gate. Email signup writes date_of_birth and age_confirmed into
 *    user metadata; the Google path validated the same fields and then threw
 *    them away on redirect, leaving Google accounts with no record that the
 *    13+ gate was ever passed.
 *
 *  - Account switching. Adding an account has to snapshot the session being
 *    switched away from, and the new session on the way back. Neither could
 *    happen across a redirect, which is why Google was simply hidden when
 *    adding an account.
 *
 * Parked in localStorage rather than sessionStorage because the native shell
 * completes the flow in a system browser and returns via a deep link, which
 * can land in a different tab. Entries expire so an abandoned consent screen
 * does not apply itself to whoever signs in next.
 */

const KEY = "hypefy_pending_oauth";
const TTL_MS = 15 * 60 * 1000;

export type PendingOAuth = {
  at: number;
  /** ISO date captured by the signup form before the redirect. */
  dob?: string | null;
  /** True when the user was adding an account rather than signing in. */
  addAccount?: boolean;
};

export function stashPendingOAuth(p: Omit<PendingOAuth, "at">) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...p, at: Date.now() }));
  } catch {
    /* private mode / quota — the flow still works, just without the extras */
  }
}

export function readPendingOAuth(): PendingOAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingOAuth;
    if (!parsed?.at || Date.now() - parsed.at > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingOAuth() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
