"use client";

import type { useRouter } from "next/navigation";

/**
 * Going back, when there may be nothing to go back to.
 *
 * `router.back()` is a no-op when the current page is the first entry in the
 * session's history — and that is exactly what happens on a shared link. Open
 * a Show or a Shot from a message and the close button silently does nothing.
 *
 * For most screens that is merely annoying. For `ShowViewer` it is a trap:
 * it renders `fixed inset-0 z-50`, which covers the bottom nav, so back() is
 * the ONLY exit — and on Android the hardware button sees `canGoBack === false`
 * and quits the app instead. A shared Show could not be left.
 *
 * The heuristic is `history.length`. It is not perfect: a browser can restore
 * a session with entries that predate the app, in which case going back leaves
 * Hypefy — but that is the browser's normal behaviour and what the reader
 * expects from back. What it reliably catches is the case that actually
 * strands people, where there is no previous entry at all.
 */

/** Whether back would go nowhere, so a destination is needed instead. */
export function shouldFallBack(historyLength: number): boolean {
  return historyLength <= 1;
}

export function safeBack(
  router: ReturnType<typeof useRouter>,
  fallback = "/home"
): void {
  if (typeof window === "undefined") return;
  if (shouldFallBack(window.history.length)) {
    // replace, not push: the entry being left is a dead end, and pushing
    // would leave it in the stack for back to land on again.
    router.replace(fallback);
    return;
  }
  router.back();
}
