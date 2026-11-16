import { kv } from "@hypefy/core/kv";

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
 *
 * Moved into the core behind the Kv interface, behaviour unchanged and its
 * test untouched. The `"use client"` directive at the top went with it: it
 * is a Next instruction, this file has no React in it, and core is read by
 * Metro too, where the directive means nothing.
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
 * speed the app cannot get them out of. `Number(null)` is 0, which is not
 * in SPEEDS, so an absent value takes the same path as a bad one.
 */
export function readSpeed(): Speed {
  const raw = Number(kv().get(KEY));
  return (SPEEDS as readonly number[]).includes(raw) ? (raw as Speed) : 1;
}

export function writeSpeed(speed: Speed): void {
  kv().set(KEY, String(speed));
}
