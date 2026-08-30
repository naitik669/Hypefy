"use client";

import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isNative } from "@/lib/native";

/**
 * Haptic feedback, native where possible.
 *
 * Two backends behind one API, because they are not equivalent. The web
 * Vibration API takes a raw millisecond duration and produces a blunt buzz;
 * the native one asks the OS for a *named* impact and gets the tuned,
 * device-specific pattern users already know from every other app. On iOS the
 * web API does not exist at all, so this is the only way to get anything.
 *
 * Roughly fifteen call sites already import this, so upgrading here upgrades
 * all of them without touching a single caller.
 */

function webVibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* Browsers throw outside a user gesture — ignore. */
  }
}

/** Native calls are async and reject on a device with no vibrator. Nothing
 *  here is worth failing an interaction over, so results are dropped. */
function native(fn: () => Promise<unknown>) {
  try {
    void fn().catch(() => {});
  } catch {
    /* plugin unavailable */
  }
}

export const haptics = {
  /** Light tap — nav switches, button presses. */
  tap: () =>
    isNative()
      ? native(() => Haptics.impact({ style: ImpactStyle.Light }))
      : webVibrate(7),

  /** Selection tick — toggles like save. */
  select: () =>
    isNative()
      // selectionStart() is for scrubbing a list; for a single toggle the
      // one-shot tick is the right feel.
      ? native(() => Haptics.selectionStart())
      : webVibrate(5),

  /** Positive confirmation — hype, send. */
  success: () =>
    isNative()
      ? native(() => Haptics.notification({ type: NotificationType.Success }))
      : webVibrate([8, 30, 12]),
};
