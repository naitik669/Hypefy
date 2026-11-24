"use client";

import { useSyncExternalStore } from "react";
import {
  availability,
  type Capabilities,
  type Env,
  type PermissionState,
  type Verdict,
} from "@hypefy/core/features";
import { buildEnv, type Host } from "@hypefy/core/feature-env";
import { FEATURES, feature, type FeatureId } from "@hypefy/core/feature-registry";

/**
 * Asking the registry, from the web app.
 *
 * This replaces `useSyncExternalStore(noop, isNative, () => false)` at the
 * availability call sites. Not a tidy-up: those call sites each decided
 * separately what the answer MEANT, and the meanings had already drifted
 * apart once — api/push/route.ts held a third copy of the notification
 * destination rule with five differences. The same shape was waiting here.
 *
 * It subscribes rather than reading once because the answer can change under
 * the user's feet: dragging a window across the tablet breakpoint changes
 * whether the admin desk is offered, and a value read at mount would be
 * wrong from then on with nothing to indicate it.
 */

/**
 * What this browser can do.
 *
 * Here rather than in core because it names web APIs, and core is asserted
 * to be importable from React Native.
 *
 * `blockCapture` and `backgroundWork` are false and not detected, because no
 * browser offers either: there is no capture-blocking API at all, and a
 * backgrounded tab is throttled to the point where a long upload stalls —
 * which is this codebase's own note about why uploads hang.
 */
export function webCapabilities(finePointer: boolean): Capabilities {
  const nav: { mediaDevices?: unknown; maxTouchPoints?: number; vibrate?: unknown } =
    typeof navigator === "undefined" ? {} : navigator;
  const media = Boolean(nav.mediaDevices);
  return {
    camera: media,
    microphone: media,
    touch: (nav.maxTouchPoints ?? 0) > 0,
    finePointer,
    haptics: typeof nav.vibrate === "function",
    blockCapture: false,
    backgroundWork: false,
  };
}

/** Width and pointer, as one subscribed value so a resize re-renders once. */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  const pointer = window.matchMedia?.("(pointer: fine)");
  pointer?.addEventListener?.("change", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    pointer?.removeEventListener?.("change", onChange);
  };
}

/**
 * Where the web app is running, as a STRING.
 *
 * useSyncExternalStore compares snapshots with Object.is, so a getSnapshot
 * returning a fresh object every call re-renders without end. The snapshot is
 * therefore a value, and `hostOf` turns it back into a Host — which has the
 * side benefit that the parse is a pure function a Node test can drive.
 *
 * `native` is false and is NOT read from Capacitor. The Capacitor shell is
 * retired: nothing serves this bundle inside a WebView any more, and
 * `Capacitor.isNativePlatform()` therefore answers false in every client
 * that runs this code. Asking it would look like a check and be a constant —
 * the shape of defect that costs weeks. The native app resolves the SAME
 * registry through its own host, in apps/mobile/src/features.ts, where
 * `native` is true by construction rather than by detection.
 */
export function webHostKey(): string {
  const fine = window.matchMedia?.("(pointer: fine)").matches === true;
  return `${window.innerWidth}|${fine ? "1" : "0"}`;
}

/**
 * The server renders the phone shape with a coarse pointer.
 *
 * Not a guess about the visitor: it is the one answer that cannot show
 * something and then take it away. The app was built as a 480px column, so
 * mobileWeb is what the markup already assumes, and a feature that is
 * unavailable there appears a beat later rather than flashing and vanishing.
 */
export const SERVER_KEY = "0|0";

/** The snapshot string back to a Host. Pure, so a test can call it. */
export function hostOf(key: string): Host {
  const [width, fine] = key.split("|");
  return { native: false, os: "web", width: Number(width), finePointer: fine === "1" };
}

function envFor(host: Host, extra: Partial<Pick<Env, "entitlements" | "flags" | "permissions">>): Env {
  return {
    ...buildEnv({ host, capabilities: webCapabilities(host.finePointer) }),
    ...extra,
  };
}

export type FeatureContext = {
  /** e.g. "premium", "verified", "admin" — what this account holds. */
  entitlements?: Iterable<string>;
  flags?: Readonly<Record<string, boolean>>;
  permissions?: Readonly<Record<string, PermissionState>>;
};

/**
 * Resolve one registry feature here, as a verdict with its reason.
 *
 * Returns the whole verdict rather than a boolean on purpose: the reason and
 * the fallback are the part worth sharing. A caller that renders only
 * `state === "unavailable"` and writes its own sentence has put the copy back
 * where it was.
 */
export function useFeature(id: FeatureId, ctx: FeatureContext = {}): Verdict {
  const host = hostOf(useSyncExternalStore(subscribe, webHostKey, () => SERVER_KEY));
  return availability(feature(id), envFor(host, {
    entitlements: new Set(ctx.entitlements ?? []),
    flags: ctx.flags ?? {},
    permissions: ctx.permissions ?? {},
  }));
}

/** The ids, re-exported so a call site needs one import. */
export { FEATURES, type FeatureId };
