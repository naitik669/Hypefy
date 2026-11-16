import type { Kv } from "@hypefy/core/kv";

/**
 * The web's key-value store: localStorage, with the apologies in one place.
 *
 * This lives in the app rather than in @hypefy/core because core may not
 * mention `localStorage` — tests/core-boundary.test.ts enforces that, and it
 * is the whole reason the core half is an interface with an install step.
 *
 * Three things every consumer used to do for itself, now done once:
 *
 *  - The server check. These modules are imported by client components,
 *    which Next still renders on the server, where there is no
 *    localStorage.
 *
 *    Worth being accurate about what this buys, because mutation checking
 *    showed it is NOT correctness: with the try/catch below, removing the
 *    guard changes nothing observable — referencing a global that does not
 *    exist throws a ReferenceError, and the catch returns null just the
 *    same. It is a COST guard. These are called during the render of client
 *    components, which do render on the server, so without it every call in
 *    every server render throws and is caught, and throwing is expensive.
 *    `typeof` is the form that works on a missing identifier; a
 *    `window === undefined` check would itself throw.
 *  - try/catch on every call. localStorage throws rather than returning
 *    null in a private window and with site data blocked, and it throws on
 *    write when the quota is full. Eleven modules each carried their own.
 *  - Treating an unreadable store as an empty one, which is what every one
 *    of them already did.
 */
export const webKv: Kv = {
  get(key) {
    try {
      // The `typeof` guard rather than a window check: on the server the
      // identifier does not exist at all, and referencing it throws.
      if (typeof localStorage === "undefined") return null;
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  set(key, value) {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(key, value);
    } catch {
      // Private mode, blocked site data, or a full quota. The feature that
      // wanted to remember something carries on without remembering it,
      // which is what each of these already chose for itself.
    }
  },

  remove(key) {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.removeItem(key);
    } catch {
      // Already gone, as far as anything reading it is concerned.
    }
  },
};
