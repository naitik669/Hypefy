/**
 * The small key-value store the app keeps device-local things in.
 *
 * Deferred from Phase 2 on purpose: the note then said designing an adapter
 * with one consumer is guesswork, and that it wanted a second real
 * implementation to design against. Measuring the consumers is what settled
 * every decision below, so here is what the measurement said.
 *
 * **Twenty modules touch key-value storage, and they are not one group.**
 * Six use `sessionStorage`, which has no native equivalent at all — there is
 * no "until the tab closes" on a phone — so those stay in the app as
 * platform code. Three also reach for `window` or `document`. Eleven are
 * pure key-value, and those are the ones this is for.
 *
 * **It is synchronous, and that is forced rather than chosen.** Three of the
 * eleven return a stored value straight out of a non-async function —
 * `readSpeed()` hands back a number, `loadRecentSearches()` hands back an
 * array. An async interface changes their signature and every call site.
 * `expo-secure-store` and AsyncStorage are both async; MMKV is not. So the
 * native implementation is MMKV, and that follows from the consumers rather
 * than from a preference.
 *
 * **It never throws.** Every one of the eleven already wraps each call in
 * try/catch, because `localStorage` throws in private mode and with site
 * data blocked, and each also guards on `typeof window`. Both belong here
 * once instead of eleven times: a store that cannot fail is a store its
 * callers do not have to apologise for.
 *
 * **Secrets do not belong here.** `saved-accounts.ts` keeps Supabase refresh
 * tokens, which on a phone belong in the Keychain or Keystore — async, and a
 * different thing entirely. It is deliberately not a consumer of this, and
 * on the web it is the reason the report-only CSP exists.
 */

export type Kv = {
  /**
   * The value, or null when absent.
   *
   * Null also when the store is unreadable or no store is installed. The
   * caller cannot tell those apart, which is correct: every existing
   * consumer already treats all three the same way.
   */
  get(key: string): string | null;
  /** Writes if it can. Does nothing if it cannot. Never throws. */
  set(key: string, value: string): void;
  remove(key: string): void;
};

/**
 * A store that remembers nothing, used until a real one is installed.
 *
 * The design note warned specifically against "a mutable global store with a
 * memory default", because that "fails silently into data loss if the web
 * app ever misses the installation step" — it appears to work for a session
 * and then everything is gone.
 *
 * This is the opposite failure and it is the one to prefer: it never appears
 * to work at all. A read straight after a write returns null, so a missing
 * installation shows up the first time anybody runs the feature, rather than
 * as data that quietly fails to survive a reload. `kvInstalled()` makes it
 * assertable on top of that, and tests/kv.test.ts asserts the web app
 * installs one at its entry point.
 */
export const absentKv: Kv = {
  get: () => null,
  set: () => {},
  remove: () => {},
};

let installed: Kv | null = null;

/**
 * Hand the core the platform's store. Called once, at the client's entry.
 *
 * The web passes a localStorage-backed one and native will pass MMKV. The
 * implementations live in the apps, not here: this package may not mention
 * `localStorage` at all, and tests/core-boundary.test.ts enforces that.
 */
export function installKv(store: Kv): void {
  installed = store;
}

/** The installed store, or one that remembers nothing. */
export function kv(): Kv {
  return installed ?? absentKv;
}

/** Whether a real store has been installed. For the assertion, not for logic. */
export function kvInstalled(): boolean {
  return installed !== null;
}

/** Puts it back to uninstalled. Tests only. */
export function resetKv(): void {
  installed = null;
}

/**
 * An in-memory store.
 *
 * Named for what it is so it cannot be reached for by accident as a
 * fallback — which is the thing `absentKv` exists to avoid. For tests, and
 * for a platform that genuinely has nowhere to write.
 */
export function memoryKv(): Kv {
  const map = new Map<string, string>();
  return {
    // `?? null` and not a `has` check: the values are strings, and `??`
    // falls back only on null and undefined — an empty string is neither,
    // so a key holding "" still reads as "". The `has` version was written
    // first and mutation checking showed the two were indistinguishable,
    // which made the extra branch dead weight rather than a safeguard.
    get: (k) => map.get(k) ?? null,
    set: (k, v) => {
      map.set(k, v);
    },
    remove: (k) => {
      map.delete(k);
    },
  };
}

/**
 * Read a JSON value, or the fallback.
 *
 * Here rather than in each consumer because four of the eleven do exactly
 * this — parse, check it is the shape expected, fall back on anything else —
 * and one of them had the check and two did not. A stored value from a
 * future version, or junk, must never reach the caller as the wrong type.
 */
export function readJson<T>(key: string, isValid: (v: unknown) => v is T, fallback: T): T {
  const raw = kv().get(key);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Write a JSON value. Does nothing if it cannot be serialised. */
export function writeJson(key: string, value: unknown): void {
  try {
    kv().set(key, JSON.stringify(value));
  } catch {
    // A value with a cycle in it. Nothing stored, nothing thrown.
  }
}
