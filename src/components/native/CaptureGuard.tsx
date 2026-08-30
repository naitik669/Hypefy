"use client";

import { useEffect } from "react";
import { guardCapture } from "@/lib/secure-screen";

/**
 * Blocks screen capture for as long as this is mounted.
 *
 * A component rather than a hook call at the call site so the protection is
 * tied to the lifetime of the thing being protected: mount it beside the
 * sensitive content and it cannot outlive it, or be forgotten on an early
 * return.
 *
 * Renders nothing, and does nothing at all on the web.
 */
export function CaptureGuard() {
  useEffect(() => guardCapture(), []);
  return null;
}
