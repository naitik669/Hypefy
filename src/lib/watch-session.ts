/**
 * How much of a Shot somebody actually watched.
 *
 * shot_views answers "did they see it, at all, that day" and nothing more:
 * it is one row, written after 1.2 seconds on screen. For short video that
 * is the least interesting question. Whether people watch eight seconds of
 * a nine-second clip or bail at two is the thing that tells an author what
 * to make next, and nothing in the app could answer it.
 *
 * This is the arithmetic, kept pure so it can be tested without a video
 * element, a browser, or a clock. The component owns one of these in a ref,
 * feeds it the player's currentTime as it ticks, and flushes the result
 * when the reel stops being the one on screen.
 *
 * Why currentTime rather than wall-clock: a paused, buffering or
 * backgrounded video keeps the wall running and stops the playhead, and
 * what is wanted is footage watched, not seconds endured. The player's own
 * clock is the only one that stops when the picture does.
 */

export type WatchSession = {
  /** Footage actually played, in ms. Excludes seeks, pauses and stalls. */
  watchedMs: number;
  /** The furthest point reached, in seconds. Completion is measured off this. */
  furthestSec: number;
  /** Times the playhead jumped back far enough to mean a loop or a rewind. */
  replays: number;
  /** The previous tick, or null before the first. */
  lastSec: number | null;
};

/**
 * The largest forward jump still counted as watching.
 *
 * timeupdate fires about four times a second, so a real tick is ~0.25s.
 * Anything much larger is a seek, a stall recovering, or the tab coming
 * back from the background — none of which is footage anybody watched.
 */
export const MAX_TICK_SEC = 1.5;

/** Backwards by more than this is a loop or a deliberate rewind, not jitter. */
export const REPLAY_BACK_SEC = 0.5;

/** Watched this proportion or more and it counts as having been finished. */
export const COMPLETE_AT = 0.95;

export function startWatch(): WatchSession {
  return { watchedMs: 0, furthestSec: 0, replays: 0, lastSec: null };
}

/**
 * Fold one playhead reading into the session. Pure: returns a new session.
 */
export function advanceWatch(s: WatchSession, currentSec: number): WatchSession {
  if (!Number.isFinite(currentSec) || currentSec < 0) return s;

  if (s.lastSec === null) {
    return { ...s, lastSec: currentSec, furthestSec: Math.max(s.furthestSec, currentSec) };
  }

  const delta = currentSec - s.lastSec;
  let watchedMs = s.watchedMs;
  let replays = s.replays;

  if (delta > 0 && delta <= MAX_TICK_SEC) {
    watchedMs += delta * 1000;
  } else if (delta <= -REPLAY_BACK_SEC) {
    // A trimmed Shot loops by having its currentTime set back to the start,
    // so this is the same event as a replay and is counted as one.
    replays += 1;
  }
  // A big forward jump falls through both: not watched, not a replay.

  return {
    watchedMs,
    replays,
    lastSec: currentSec,
    furthestSec: Math.max(s.furthestSec, currentSec),
  };
}

/**
 * How far through they got, 0 to 1.
 *
 * Measured from the furthest point reached rather than from watched time,
 * so skipping ahead to the end does not read as having watched it all, and
 * watching the first half twice does not read as having watched the lot.
 * Returns 0 when the duration is unknown — a ratio against an unknown
 * denominator is worse than no ratio.
 */
export function completionOf(s: WatchSession, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return Math.min(1, Math.max(0, s.furthestSec / durationSec));
}

/** Did they reach the end, within the tolerance a last frame deserves? */
export function watchedToEnd(s: WatchSession, durationSec: number): boolean {
  return completionOf(s, durationSec) >= COMPLETE_AT;
}

/**
 * Is this worth a round trip?
 *
 * A reel the thumb flicked straight past produces a session of a few
 * milliseconds, and writing those would be most of the rows and none of
 * the information. The floor matches WATCH_MS in lib/watched, so a Shot
 * counted as viewed is a Shot whose watch time is recorded and the two
 * tables cannot disagree about what happened.
 */
export function worthRecording(s: WatchSession, minMs = 1200): boolean {
  return s.watchedMs >= minMs;
}
