import { availability, type Capabilities, type Verdict } from "@hypefy/core/features";
import { buildEnv } from "@hypefy/core/feature-env";
import { feature, type FeatureId } from "@hypefy/core/feature-registry";

/**
 * Driving the registry seam in a component test.
 *
 * Three suites used to mock `@/lib/native`'s isNative() to decide whether a
 * component was "in the app". That had quietly stopped meaning anything: the
 * Capacitor shell is retired, so isNative() answers false in every client
 * that runs this code, and those tests were proving the UI behaves correctly
 * in an environment that no longer exists.
 *
 * What the components ask now is @/lib/use-feature — the one place a client
 * asks "is this available here". Mocking THAT is mocking the question rather
 * than a platform, and the answer below is the registry's own: it resolves
 * the real entry against a real environment, so a test cannot assert words
 * or a verdict the product does not actually produce.
 *
 * Shared because three suites need it and the alternative is three copies of
 * an environment — which is the drift this whole slice exists to remove.
 */

const PHONE: Capabilities = {
  camera: true,
  microphone: true,
  touch: true,
  finePointer: false,
  haptics: true,
  blockCapture: true,
  backgroundWork: true,
};

const DESKTOP: Capabilities = {
  camera: true,
  microphone: true,
  touch: false,
  finePointer: true,
  haptics: false,
  blockCapture: false,
  backgroundWork: false,
};

/** The verdict a component would get, in an app or in a desktop browser. */
export function verdictHere(id: FeatureId, native: boolean): Verdict {
  return availability(
    feature(id),
    native
      ? buildEnv({
          host: { native: true, os: "android", width: 0, finePointer: false },
          capabilities: PHONE,
        })
      : buildEnv({
          host: { native: false, os: "web", width: 1440, finePointer: true },
          capabilities: DESKTOP,
        }),
  );
}
