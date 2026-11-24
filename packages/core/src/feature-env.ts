import { shapeFor } from "@hypefy/tokens";
import type { Capabilities, Env, PermissionState, Platform } from "@hypefy/core/features";

/**
 * Building the environment a feature is resolved against.
 *
 * features.ts deliberately takes the environment as an argument so it can
 * stay platform-free. That left every client to construct one, which is the
 * part that drifts: two clients that disagree about what platform they are
 * resolve the same rule to different answers, and the rule looks innocent in
 * both files.
 *
 * So the PLATFORM decision is here, pure, and each client supplies only what
 * it
 * alone can know — whether it is a native app, how wide the window is, what
 * the device has. The decision of what those facts MEAN is made once.
 *
 * What is NOT here: reading the capabilities. Each client's reader names
 * APIs that only exist there — `navigator.mediaDevices` on the web,
 * FLAG_SECURE on Android — and core is asserted to be importable from React
 * Native, which means it cannot name them. tests/core-boundary caught that
 * while this module was being written, which is the test working.
 */

/** What a client can observe about where it is running. */
export type Host = {
  /** Running inside a native app binary, rather than a browser. */
  native: boolean;
  os: "android" | "ios" | "web";
  /** Viewport width in CSS pixels. Ignored when `native`. */
  width: number;
  /** A mouse or trackpad — `(pointer: fine)`. Ignored when `native`. */
  finePointer: boolean;
};

/**
 * Which of the five platforms this host is.
 *
 * The web shapes come from @hypefy/tokens' own breakpoints rather than from
 * numbers typed here, because the layout and the feature rules have to agree
 * about where tablet ends: "the admin desk needs a wider screen" is a claim
 * about the same boundary the rail appears at.
 *
 * A wide TOUCH screen is tabletWeb, not desktopWeb, and that is deliberate.
 * Phase 4a made the same call for BottomSheet — it becomes a centred dialog
 * at `1024px and (pointer: fine)` because "a 1024px touch tablet is still a
 * device you throw a sheet on". A feature that is unavailable on a phone for
 * reach reasons is unavailable on that tablet too.
 */
export function platformFor(host: Host): Platform {
  if (host.native) {
    // An unknown OS inside a native binary is treated as Android rather than
    // as the web: the web answer would hand it every rule the stores forbid.
    return host.os === "ios" ? "iosNative" : "androidNative";
  }
  const shape = shapeFor(host.width);
  if (shape === "phone") return "mobileWeb";
  if (shape === "tablet") return "tabletWeb";
  return host.finePointer ? "desktopWeb" : "tabletWeb";
}

/**
 * The environment, assembled.
 *
 * Entitlements, flags and permissions are passed in rather than discovered:
 * a component knows whether this account has premium, and inventing a global
 * store for it here would be a second source of truth for something the page
 * already loaded.
 */
export function buildEnv(args: {
  host: Host;
  capabilities: Capabilities;
  entitlements?: Iterable<string>;
  flags?: Readonly<Record<string, boolean>>;
  permissions?: Readonly<Record<string, PermissionState>>;
}): Env {
  return {
    platform: platformFor(args.host),
    capabilities: args.capabilities,
    entitlements: new Set(args.entitlements ?? []),
    flags: args.flags ?? {},
    permissions: args.permissions ?? {},
  };
}
