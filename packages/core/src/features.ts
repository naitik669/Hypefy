/**
 * Whether a feature is available here, and if not, why.
 *
 * Replaces `if (isNative())` scattered through components. Not because the
 * conditionals were wrong — they are mostly right — but because each one
 * carries a *reason* that lives only in a comment next to it, and the reasons
 * are the part that matters. "Purchases are off in the app" is not a
 * preference; it is Play's billing rule. "Ads are off in the app" is AdSense
 * policy. Those belong in one table that can be read, tested and explained,
 * not spread across five components.
 *
 * Five independent inputs, because they fail for different reasons and the
 * user needs a different sentence for each:
 *
 *   1. device capability   — this phone has no camera
 *   2. platform policy     — the store forbids it here
 *   3. entitlement         — you do not have premium
 *   4. rollout             — not switched on yet
 *   5. permission          — you said no to the camera
 *
 * The environment is passed in rather than read from a global. That keeps
 * this module platform-free (it is in core, so it cannot touch Capacitor,
 * `window` or anything else), and it means every rule is testable by handing
 * it an environment rather than by mocking the world.
 *
 * What this is NOT: access control. See `enforce`.
 */

export type Platform =
  | "androidNative"
  | "iosNative"
  | "mobileWeb"
  | "tabletWeb"
  | "desktopWeb";

/** Whether the platform is one of the native apps. */
export function isNativePlatform(p: Platform): boolean {
  return p === "androidNative" || p === "iosNative";
}

export type Availability = "full" | "degraded" | "unavailable";

export type PermissionState = "granted" | "denied" | "prompt";

/** What the device can actually do, as distinct from what platform it is. */
export type Capabilities = {
  camera: boolean;
  microphone: boolean;
  touch: boolean;
  /** A mouse or trackpad — `(pointer: fine)`. */
  finePointer: boolean;
  haptics: boolean;
  /** Screenshot and screen-recording can be blocked (Android FLAG_SECURE). */
  blockCapture: boolean;
  /** Work can continue after the app is backgrounded. */
  backgroundWork: boolean;
};

export type Env = {
  platform: Platform;
  capabilities: Capabilities;
  /** e.g. "premium", "verified", "admin". */
  entitlements: ReadonlySet<string>;
  /** Server-controlled rollout switches. */
  flags: Readonly<Record<string, boolean>>;
  permissions: Readonly<Record<string, PermissionState>>;
};

export type Feature = {
  id: string;

  /** Capabilities the device must have. */
  requires?: Partial<Record<keyof Capabilities, true>>;

  /**
   * Per-platform override, for policy rather than capability.
   *
   * A platform listed as "unavailable" here is a rule imposed from outside —
   * a store's billing policy, an ad network's terms — not something the
   * device cannot do. Platforms left out default to "full".
   */
  platforms?: Partial<Record<Platform, Availability>>;

  /** Entitlements the account must hold, all of them. */
  needs?: readonly string[];

  /** A rollout switch. Absent means always on. */
  flag?: string;

  /** A permission that must not be denied. */
  permission?: string;

  /** Why it is unavailable, per platform, with "default" as the fallback text. */
  reason?: Partial<Record<Platform | "default", string>>;

  fallback?: {
    /** What somebody can do instead. */
    what: string;
    /**
     * Platforms where the fallback must NOT be named.
     *
     * This exists because of a real rule rather than a style preference:
     * both app stores refuse apps that point people at a purchase outside
     * their own billing, so "buy it on the website" is a sentence that
     * cannot be said inside the app even though it is true. The app says
     * only that the thing is unavailable here.
     */
    unmentionableOn?: readonly Platform[];
  };

  /**
   * Where the rule is actually enforced.
   *
   * "client" means this only decides what the UI offers — fine for a promo
   * line or a layout choice. "server" means the real check lives in RLS or an
   * API route and THIS IS ONLY THE UI HALF. Hiding a button is not access
   * control, and a feature that protects data or money must say "server" so
   * that nobody mistakes the registry for the lock.
   */
  enforce: "client" | "server";
};

export type Verdict = {
  state: Availability;
  /** Why, in words somebody can read. Absent when the state is "full". */
  reason?: string;
  /** What to do instead, when it is both available and sayable here. */
  fallback?: string;
};

const DENIED: Record<string, string> = {
  capability: "This device can't do that.",
  platform: "Not available here.",
  entitlement: "Not included in your plan.",
  flag: "Not switched on yet.",
  permission: "Permission was declined.",
};

function reasonFor(f: Feature, env: Env, kind: keyof typeof DENIED): string {
  return f.reason?.[env.platform] ?? f.reason?.default ?? DENIED[kind];
}

function fallbackFor(f: Feature, env: Env): string | undefined {
  if (!f.fallback) return undefined;
  return f.fallback.unmentionableOn?.includes(env.platform) ? undefined : f.fallback.what;
}

/**
 * Resolve one feature against one environment.
 *
 * Checked in a fixed order, and the FIRST blocking reason is the one
 * returned, because that is the one a person can act on. Being told "not in
 * your plan" when the real problem is that the phone has no camera sends
 * somebody to the billing page for nothing.
 *
 * Capability comes before platform deliberately: "this device has no camera"
 * stays true as browsers improve, where "this is the web" quietly becomes
 * wrong.
 */
export function availability(f: Feature, env: Env): Verdict {
  for (const need of Object.keys(f.requires ?? {}) as (keyof Capabilities)[]) {
    if (!env.capabilities[need]) {
      return { state: "unavailable", reason: reasonFor(f, env, "capability"), fallback: fallbackFor(f, env) };
    }
  }

  const byPlatform = f.platforms?.[env.platform] ?? "full";
  if (byPlatform === "unavailable") {
    return { state: "unavailable", reason: reasonFor(f, env, "platform"), fallback: fallbackFor(f, env) };
  }

  for (const e of f.needs ?? []) {
    if (!env.entitlements.has(e)) {
      return { state: "unavailable", reason: reasonFor(f, env, "entitlement"), fallback: fallbackFor(f, env) };
    }
  }

  if (f.flag && !env.flags[f.flag]) {
    return { state: "unavailable", reason: reasonFor(f, env, "flag"), fallback: fallbackFor(f, env) };
  }

  if (f.permission && env.permissions[f.permission] === "denied") {
    return { state: "unavailable", reason: reasonFor(f, env, "permission"), fallback: fallbackFor(f, env) };
  }

  // "degraded" is a real answer, not a near-miss: the thing works, less well.
  if (byPlatform === "degraded") {
    return { state: "degraded", reason: reasonFor(f, env, "platform"), fallback: fallbackFor(f, env) };
  }

  return { state: "full" };
}

/** Convenience: is it usable at all here. */
export function isAvailable(f: Feature, env: Env): boolean {
  return availability(f, env).state !== "unavailable";
}
