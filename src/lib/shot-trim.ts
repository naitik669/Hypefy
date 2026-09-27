/**
 * How long a Shot is allowed to be, and which part of the file plays.
 *
 * Shots had no length limit at all — the only guard was the 50 MB bucket, so
 * a three-minute clip was a valid Shot in a feed people flick through.
 *
 * The trim is metadata, not a cut. The uploaded file is untouched and the
 * player shows the chosen range, the same shape a Shot's song already has: a
 * column played alongside the video rather than mixed into it. That keeps all
 * of this off the phone's CPU, at one honest cost — a long clip trimmed short
 * still uploads in full.
 */

/** The longest a Shot may play. */
export const MAX_SHOT_SECS = 60;

/**
 * The shortest a Shot may play.
 *
 * Below about a second a Shot is a flicker rather than a thing to watch, and
 * a trim handle dragged to nothing is almost always a slip rather than an
 * intent.
 */
export const MIN_SHOT_SECS = 1;

/** Seconds are stored to this many decimals — finer than any frame. */
const PRECISION = 3;

const round = (n: number) => Number(n.toFixed(PRECISION));

/** A clip this long cannot be posted whole. */
export function needsTrim(duration: number): boolean {
  return Number.isFinite(duration) && duration > MAX_SHOT_SECS;
}

/** A clip this short cannot be posted at all, trimmed or not. */
export function tooShort(duration: number): boolean {
  return !Number.isFinite(duration) || duration <= 0 || duration < MIN_SHOT_SECS;
}

export type Trim = { start: number; end: number };

/**
 * Where the handles sit when the trimmer opens.
 *
 * A clip that already fits is selected whole — opening with an arbitrary
 * window would imply the person has to do something when they do not. A long
 * one opens on its first allowed minute, because the start of a clip is far
 * more often the wanted part than the middle.
 */
export function defaultTrim(duration: number): Trim {
  if (!Number.isFinite(duration) || duration <= 0) return { start: 0, end: 0 };
  return { start: 0, end: round(Math.min(duration, MAX_SHOT_SECS)) };
}

/**
 * Pull a proposed selection back inside the rules.
 *
 * Keeps whichever edge the person is not holding still where possible: a
 * start dragged past the end pushes the end along rather than swapping them,
 * which is what dragging feels like it should do.
 */
export function clampTrim(start: number, end: number, duration: number): Trim {
  if (!Number.isFinite(duration) || duration <= 0) return { start: 0, end: 0 };
  const span = Math.min(duration, MAX_SHOT_SECS);
  const floor = Math.min(MIN_SHOT_SECS, duration);

  let s = Math.min(Math.max(0, start), Math.max(0, duration - floor));
  let e = Math.min(Math.max(end, s + floor), duration);
  // The end may have been pushed past the far edge by the line above; if so
  // the start gives way instead, so the window keeps its minimum length.
  if (e - s < floor) s = Math.max(0, e - floor);
  // And it may now be longer than a Shot is allowed to be.
  if (e - s > span) e = s + span;

  return { start: round(s), end: round(e) };
}

/**
 * What goes in the row.
 *
 * A selection covering the whole clip is stored as null rather than as
 * 0-to-duration: null means "no bound", which is what every Shot posted
 * before trimming existed already says, so the player has one case to handle
 * instead of two that mean the same thing.
 */
export function trimToStore(
  trim: Trim,
  duration: number,
): { trim_start: number | null; trim_end: number | null } {
  if (!Number.isFinite(duration) || duration <= 0) return { trim_start: null, trim_end: null };
  // A hair of tolerance: a handle left at the very end can land a thousandth
  // short of the duration and should not be recorded as a trim.
  const whole = trim.start <= 0.001 && trim.end >= duration - 0.001;
  if (whole) return { trim_start: null, trim_end: null };
  return {
    trim_start: trim.start > 0.001 ? round(trim.start) : null,
    trim_end: trim.end < duration - 0.001 ? round(trim.end) : null,
  };
}

/**
 * The window the player should loop, for a Shot read back from the row.
 *
 * Null on either side means no bound there. An end at or before the start —
 * which the database constraint rejects, but which an older or hand-edited
 * row could still carry — is ignored rather than allowed to freeze playback
 * on a zero-length loop.
 */
export function playbackWindow(shot: {
  trim_start?: number | null;
  trim_end?: number | null;
}): { start: number; end: number | null } {
  const start = typeof shot.trim_start === "number" && shot.trim_start > 0 ? shot.trim_start : 0;
  const end = typeof shot.trim_end === "number" && shot.trim_end > start ? shot.trim_end : null;
  return { start, end };
}

/** m:ss, for the readouts on the trimmer. */
export function fmtSecs(secs: number): string {
  const safe = Number.isFinite(secs) && secs > 0 ? secs : 0;
  const m = Math.floor(safe / 60);
  const s = String(Math.floor(safe % 60)).padStart(2, "0");
  return `${m}:${s}`;
}
