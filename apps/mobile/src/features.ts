import {
  availability,
  type Capabilities,
  type Env,
  type PermissionState,
  type Verdict,
} from "@hypefy/core/features";
import { buildEnv } from "@hypefy/core/feature-env";
import { feature, type FeatureId } from "@hypefy/core/feature-registry";

/**
 * Asking the registry, from the phone.
 *
 * There is no caller yet — the app has no marketplace, no ads and no calls,
 * so nothing has needed to ask. This exists anyway, because of a finding from
 * #90 that is still open: the flag that blocks buying is
 * `Capacitor.isNativePlatform()`, the retired shell sets it nowhere, and so
 * the protection everybody believes is in place would not apply to the one
 * client that is actually submitted to a store. The note said "whoever ports
 * a marketplace to the phone has to gate it themselves", which is a hope
 * rather than a gate.
 *
 * This is the gate. `native: true` is written here, not detected, so the
 * store rules resolve correctly in this client by CONSTRUCTION — there is no
 * environment in which this module can answer "web". tests/feature-consumers
 * asserts that, and asserts that a billing or ads screen appearing under
 * apps/mobile has to come through here.
 *
 * Deliberately free of react-native: `expo-*` and `react-native` imports fail
 * under Vitest with "__DEV__ is not defined", and the lesson from
 * notifications/platform.ts is that a decision worth testing is kept in a
 * module a Node test can call. The OS is passed in; the one caller that ever
 * needs `Platform.OS` reads it at the call site.
 */

export type NativeOs = "android" | "ios";

/**
 * What this phone can do.
 *
 * Capture blocking is Android's FLAG_SECURE and has no iOS equivalent, which
 * is why it is a capability rather than "native vs web" — the copy must never
 * promise more than the device can do.
 */
export function nativeCapabilities(os: NativeOs): Capabilities {
  return {
    camera: true,
    microphone: true,
    touch: true,
    finePointer: false,
    haptics: true,
    blockCapture: os === "android",
    backgroundWork: true,
  };
}

export type NativeContext = {
  entitlements?: Iterable<string>;
  flags?: Readonly<Record<string, boolean>>;
  permissions?: Readonly<Record<string, PermissionState>>;
};

/**
 * The environment this phone resolves rules against.
 *
 * Exported so a test can assert the platform it produces, per OS. Without
 * that, a version of this that hard-codes one platform passes every rule
 * test today — the store rules happen to read the same for Android and
 * iOS — and breaks silently the first time a rule differs between them.
 */
export function envHere(os: NativeOs, ctx: NativeContext = {}): Env {
  return buildEnv({
    host: { native: true, os, width: 0, finePointer: false },
    capabilities: nativeCapabilities(os),
    ...ctx,
  });
}

/** Resolve one registry feature on this phone, with its reason. */
export function featureHere(id: FeatureId, os: NativeOs, ctx: NativeContext = {}): Verdict {
  return availability(feature(id), envHere(os, ctx));
}
