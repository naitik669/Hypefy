/**
 * How long a Show holds the screen, and what it is made of.
 *
 * The viewer ran a fixed five seconds whatever it was showing. For a photo
 * that is right; for a video it meant a twenty-second clip was cut off at
 * five, every time, with no way to tell from the progress bar that there
 * was more. A Show's clock should be the thing it is showing.
 *
 * Pure, so the viewer, the grid and anything that preloads the next Show
 * all agree without a second copy of the rules.
 */

import { isVideoUrl } from "@/lib/video-mime";

/** A photo's time on screen. Unchanged — it was the one right number. */
export const SHOW_PHOTO_MS = 5000;

/**
 * The longest a video holds the screen, however long the file is.
 *
 * The bucket takes 25 MB, which is minutes of low-bitrate video. A Show is
 * something you watch on the way past; a run of them should not be able to
 * trap you behind one clip.
 */
export const SHOW_VIDEO_MAX_MS = 30_000;

/** The shortest, so a quarter-second file is not a flash with a tick. */
export const SHOW_VIDEO_MIN_MS = 1500;

/**
 * What a video that will not say how long it is gets.
 *
 * `duration` is NaN until metadata loads and Infinity for a stream, and on
 * a bad connection it may never arrive. Long enough to be worth watching,
 * short enough not to strand the viewer.
 */
export const SHOW_VIDEO_FALLBACK_MS = 10_000;

export type ShowMediaKind = "photo" | "video" | "none";

/** What to draw it with. */
export function showMediaKind(url: string | null | undefined): ShowMediaKind {
  if (!url) return "none";
  return isVideoUrl(url) ? "video" : "photo";
}

/**
 * How long this Show should run, in milliseconds.
 *
 * `seconds` is the video element's own `duration` once it knows it, and
 * null before then. Anything that is not a real, finite, positive number
 * falls back rather than producing a bar that never moves or finishes
 * instantly.
 */
export function showDurationMs(
  url: string | null | undefined,
  seconds: number | null | undefined,
): number {
  if (showMediaKind(url) !== "video") return SHOW_PHOTO_MS;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return SHOW_VIDEO_FALLBACK_MS;
  }
  const ms = Math.round(seconds * 1000);
  return Math.min(Math.max(ms, SHOW_VIDEO_MIN_MS), SHOW_VIDEO_MAX_MS);
}
