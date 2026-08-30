"use client";

import { Capacitor } from "@capacitor/core";

/**
 * The one place that knows whether we are inside the native shell.
 *
 * Every wrapper here is a no-op on the web. The same bundle serves
 * hypefy.chat in a browser and the Android WebView, so native calls must
 * degrade silently rather than being guarded at every call site — otherwise
 * every feature grows an `if (isNative)` and the web build starts throwing on
 * plugins that were never registered.
 */

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    // Capacitor is not present at all (SSR, or a plain web build).
    return false;
  }
}

export function platform(): "android" | "ios" | "web" {
  try {
    const p = Capacitor.getPlatform();
    return p === "android" || p === "ios" ? p : "web";
  } catch {
    return "web";
  }
}

/** Android only: the OS back gesture / button. */
export const isAndroidApp = () => platform() === "android";

/**
 * Run a native call, swallowing anything that goes wrong.
 *
 * Native plugin failures are never worth breaking a UI interaction over — a
 * missing haptic or an unavailable status bar should not take down the tap
 * that triggered it.
 */
export async function safeNative<T>(fn: () => Promise<T> | T): Promise<T | null> {
  if (!isNative()) return null;
  try {
    return await fn();
  } catch {
    return null;
  }
}
