/**
 * Loading Google's ad script, once.
 *
 * Hand-rolled rather than `next/script`, which this app uses nowhere — the
 * pattern is `loadSdkScript` in spotify-player.ts. That is not only
 * consistency: `next/script` would inject the tag on every page for every
 * reader, whereas loading from the slot's own effect means a reader who never
 * gets a slot — inside the Android app, in the EEA, or on any deploy with ads
 * unconfigured — never fetches Google's bundle and never opens a connection to
 * pagead2.googlesyndication.com at all.
 */

const HOST = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let promise: Promise<void> | null = null;

/** Thrown when the script never arrives. Overwhelmingly an ad blocker. */
export const AD_BLOCKED = "adsense-unavailable";

/**
 * Safe to call from every slot; the fetch happens once and everyone after
 * awaits the same promise.
 */
export function loadAdSense(client: string): Promise<void> {
  if (promise) return promise;

  promise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      return reject(new Error("adsense: no window"));
    }

    const src = `${HOST}?client=${encodeURIComponent(client)}`;

    // Already in the document — another slot got here first, or a bfcache
    // restore brought it back.
    if (document.querySelector(`script[src="${src}"]`)) return resolve();

    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.crossOrigin = "anonymous";
    el.onload = () => resolve();
    // The expected failure, not an exceptional one: a blocked request lands
    // here. Callers show the house card. Nothing about this belongs in error
    // reporting — it would drown everything that is actually broken.
    el.onerror = () => reject(new Error(AD_BLOCKED));
    document.head.appendChild(el);
  });

  return promise;
}

/** Test seam: forget the memo so a later call re-attempts the load. */
export function resetAdSenseForTests() {
  promise = null;
}
