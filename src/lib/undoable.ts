"use client";

/**
 * Deletions you can take back.
 *
 * Undo here means DEFERRING the delete, not reversing it, and that is forced
 * by what the server actually does. Posts and Shots are hard-deleted rows;
 * unsend_message overwrites the body with null. Once any of those has run
 * there is nothing left to restore — an "undo" built on top would be a
 * button that lies. So the row is removed from the screen at once, the real
 * call is held for a few seconds, and tapping Undo simply means it never
 * happens.
 *
 * The obvious hole is leaving before the timer fires: close the tab inside
 * the window and the delete would silently never run, which is worse than no
 * undo — you would be told it was deleted and find it still there. Every
 * pending commit is therefore flushed on pagehide, and on the tab being
 * hidden, which on mobile is the last reliable moment before the browser may
 * discard the page entirely.
 */

/** How long an undo stays offered. */
export const UNDO_MS = 5000;

type Pending = {
  commit: () => void | Promise<void>;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Set<Pending>();

/** Run everything still waiting, now. */
export function flushUndoables(): void {
  for (const p of [...pending]) {
    clearTimeout(p.timer);
    pending.delete(p);
    try {
      void p.commit();
    } catch {
      /* a failed flush must not stop the rest */
    }
  }
}

/** How many deletes are waiting. Exposed for tests. */
export function pendingUndoables(): number {
  return pending.size;
}

let wired = false;
function wireFlush() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  // pagehide rather than beforeunload: beforeunload is unreliable on mobile
  // Safari and does not fire when the page is discarded from the background.
  window.addEventListener("pagehide", flushUndoables);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushUndoables();
  });
}

/**
 * Hold `commit` for a few seconds. Returns the canceller — call it and the
 * commit never runs.
 *
 * Cancelling twice, or cancelling after it has already fired, is a no-op
 * rather than an error: the undo button and the timer race by design.
 */
export function scheduleUndoable(
  commit: () => void | Promise<void>,
  delayMs: number = UNDO_MS
): () => void {
  wireFlush();

  const entry: Pending = {
    commit,
    timer: setTimeout(() => {
      // Dropped from the set BEFORE running, so a flush landing at the same
      // moment cannot send the same delete twice.
      if (!pending.delete(entry)) return;
      void commit();
    }, delayMs),
  };
  pending.add(entry);

  return () => {
    if (!pending.delete(entry)) return;
    clearTimeout(entry.timer);
  };
}
