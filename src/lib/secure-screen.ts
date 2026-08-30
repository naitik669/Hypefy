"use client";

import { registerPlugin } from "@capacitor/core";
import { isNative, safeNative } from "@/lib/native";

/**
 * TypeScript face of the SecureScreenPlugin (android/.../SecureScreenPlugin.java).
 *
 * Screenshot blocking is the one OneShot promise the web cannot keep: browsers
 * expose no capture API to detect or prevent, so on the web the product can
 * only ask. FLAG_SECURE is enforced by Android itself.
 */
interface SecureScreenPlugin {
  enable(): Promise<void>;
  disable(): Promise<void>;
  isSupported(): Promise<{ supported: boolean }>;
}

const SecureScreen = registerPlugin<SecureScreenPlugin>("SecureScreen");

/** True only where capture can genuinely be blocked — used to decide whether
 *  to promise it in copy, rather than claiming protection we do not have. */
export function canBlockCapture(): boolean {
  return isNative();
}

export async function enableCaptureBlock() {
  await safeNative(() => SecureScreen.enable());
}

export async function disableCaptureBlock() {
  await safeNative(() => SecureScreen.disable());
}

/**
 * Guard a sensitive screen for as long as the caller needs it, then release.
 *
 * Returned as a disposer rather than a toggle because the flag is
 * window-wide: two overlapping screens each turning it off on unmount would
 * unsecure the window while the other was still open. Callers pair this with
 * an effect cleanup so the lifetime is explicit.
 */
export function guardCapture(): () => void {
  void enableCaptureBlock();
  return () => { void disableCaptureBlock(); };
}
