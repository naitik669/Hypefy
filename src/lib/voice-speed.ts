"use client";

/**
 * How fast voice notes play.
 *
 * A listener who wants them quick wants them quick for all of them, not
 * one at a time, so the choice is kept per device and every note picks it
 * up. It is not a per-message setting and never appears as one.
 *
 * Three steps, not a slider. The difference between 1.5 and 1.6 is not
 * worth a gesture, and a slider on a bubble this small would be a target
 * nobody could hit.
 */

const KEY = "hypefy_voice_speed";

export const SPEEDS = [1, 1.5, 2] as const;
export type Speed = (typeof SPEEDS)[number];

/** The next step round the loop. */
export function nextSpeed(current: number): Speed {
  const at = SPEEDS.indexOf(current as Speed);
  return SPEEDS[(at + 1) % SPEEDS.length];
}

/** "1×", "1.5×", "2×" — short enough to live on the bubble. */
export function speedLabel(speed: number): string {
  return `${speed}×`;
}

/**
 * The speed this device last chose.
 *
 * Anything unrecognised reads as normal: a stored value from a future
 * version, or junk, must not leave somebody with voice notes playing at a
 * speed the app cannot get them out of.
 */
export function readSpeed(): Speed {
  if (typeof window === "undefined") return 1;
  try {
    const raw = Number(localStorage.getItem(KEY));
    return (SPEEDS as readonly number[]).includes(raw) ? (raw as Speed) : 1;
  } catch {
    return 1;
  }
}

export function writeSpeed(speed: Speed): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, String(speed));
  } catch {
    /* private mode: it plays at normal next time, which is the safe one */
  }
}
