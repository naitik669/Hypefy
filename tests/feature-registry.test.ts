import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  availability,
  isAvailable,
  isNativePlatform,
  type Capabilities,
  type Env,
  type Feature,
  type Platform,
} from "@hypefy/core/features";
import { FEATURES, feature, type FeatureId } from "@hypefy/core/feature-registry";

/**
 * The registry answers "can I do this here, and why not". These tests are in
 * two halves: the engine resolves correctly, and the entries describe the
 * rules the app actually operates under.
 */

const ALL: Capabilities = {
  camera: true, microphone: true, touch: true, finePointer: true,
  haptics: true, blockCapture: true, backgroundWork: true,
};
const NONE: Capabilities = {
  camera: false, microphone: false, touch: false, finePointer: false,
  haptics: false, blockCapture: false, backgroundWork: false,
};

const env = (over: Partial<Env> = {}): Env => ({
  platform: "desktopWeb",
  capabilities: ALL,
  entitlements: new Set(),
  flags: {},
  permissions: {},
  ...over,
});

/**
 * The registry as plain [id, Feature] pairs.
 *
 * Object.entries over a `satisfies` object gives a union in which not every
 * member has every optional key, so reading f.platforms off it does not
 * typecheck. The values ARE Features — that is what `satisfies` asserts — so
 * this says so once rather than casting at each use.
 */
const entries = (): [string, Feature][] =>
  Object.entries(FEATURES) as [string, Feature][];

const PLATFORMS: Platform[] = [
  "androidNative", "iosNative", "mobileWeb", "tabletWeb", "desktopWeb",
];

describe("resolving a feature", () => {
  it("is available when nothing blocks it", () => {
    const f: Feature = { id: "x", enforce: "client" };
    expect(availability(f, env())).toEqual({ state: "full" });
    expect(isAvailable(f, env())).toBe(true);
  });

  it("a missing capability blocks it, whatever the platform", () => {
    const f: Feature = { id: "x", requires: { camera: true }, enforce: "client" };
    expect(availability(f, env({ capabilities: NONE })).state).toBe("unavailable");
    // Including on native, which is the point of checking capability at all.
    expect(
      availability(f, env({ platform: "androidNative", capabilities: NONE })).state,
    ).toBe("unavailable");
  });

  it("capability is checked BEFORE platform and entitlement", () => {
    // Being told "not in your plan" when the phone has no camera sends
    // somebody to the billing page for nothing.
    const f: Feature = {
      id: "x",
      requires: { camera: true },
      needs: ["premium"],
      reason: { default: "No camera on this device" },
      enforce: "client",
    };
    const v = availability(f, env({ capabilities: NONE }));
    expect(v.reason).toBe("No camera on this device");
  });

  it("a platform may be unavailable by policy even with every capability", () => {
    const f: Feature = {
      id: "x",
      platforms: { androidNative: "unavailable" },
      enforce: "client",
    };
    expect(availability(f, env({ platform: "androidNative" })).state).toBe("unavailable");
    expect(availability(f, env({ platform: "desktopWeb" })).state).toBe("full");
  });

  it("degraded is its own answer, not a near-miss", () => {
    const f: Feature = {
      id: "x",
      platforms: { mobileWeb: "degraded" },
      reason: { default: "Works better in the app" },
      enforce: "client",
    };
    const v = availability(f, env({ platform: "mobileWeb" }));
    expect(v.state).toBe("degraded");
    expect(v.reason).toBe("Works better in the app");
    // Degraded still counts as usable.
    expect(isAvailable(f, env({ platform: "mobileWeb" }))).toBe(true);
  });

  it("an entitlement it does not hold blocks it", () => {
    const f: Feature = { id: "x", needs: ["premium"], enforce: "server" };
    expect(availability(f, env()).state).toBe("unavailable");
    expect(isAvailable(f, env({ entitlements: new Set(["premium"]) }))).toBe(true);
  });

  it("every named entitlement is required, not just one", () => {
    const f: Feature = { id: "x", needs: ["premium", "verified"], enforce: "server" };
    expect(isAvailable(f, env({ entitlements: new Set(["premium"]) }))).toBe(false);
    expect(isAvailable(f, env({ entitlements: new Set(["premium", "verified"]) }))).toBe(true);
  });

  it("a rollout flag that is off blocks it, and absent means always on", () => {
    expect(isAvailable({ id: "x", flag: "beta", enforce: "client" }, env())).toBe(false);
    expect(
      isAvailable({ id: "x", flag: "beta", enforce: "client" }, env({ flags: { beta: true } })),
    ).toBe(true);
    expect(isAvailable({ id: "x", enforce: "client" }, env())).toBe(true);
  });

  it("a denied permission blocks it, but an unanswered one does not", () => {
    const f: Feature = { id: "x", permission: "camera", enforce: "client" };
    expect(isAvailable(f, env({ permissions: { camera: "denied" } }))).toBe(false);
    // "prompt" means not asked yet — blocking there would stop the app ever
    // getting as far as asking.
    expect(isAvailable(f, env({ permissions: { camera: "prompt" } }))).toBe(true);
    expect(isAvailable(f, env({ permissions: { camera: "granted" } }))).toBe(true);
  });

  it("the reason is the one for this platform when there is one", () => {
    const f: Feature = {
      id: "x",
      platforms: { androidNative: "unavailable", desktopWeb: "unavailable" },
      reason: { androidNative: "Not in the app", default: "Not here" },
      enforce: "client",
    };
    expect(availability(f, env({ platform: "androidNative" })).reason).toBe("Not in the app");
    expect(availability(f, env({ platform: "desktopWeb" })).reason).toBe("Not here");
  });

  it("and there is always a reason when something is blocked", () => {
    // A blocked feature with no explanation is the failure this replaces.
    const bare: Feature = { id: "x", needs: ["premium"], enforce: "client" };
    expect(availability(bare, env()).reason).toBeTruthy();
  });
});

describe("fallbacks, and the ones that may not be spoken", () => {
  const f: Feature = {
    id: "x",
    platforms: { androidNative: "unavailable", desktopWeb: "unavailable" },
    fallback: { what: "Buy it on hypefy.chat", unmentionableOn: ["androidNative"] },
    enforce: "server",
  };

  it("a fallback is offered where it may be", () => {
    expect(availability(f, env({ platform: "desktopWeb" })).fallback).toBe("Buy it on hypefy.chat");
  });

  it("and withheld where naming it breaks a store rule", () => {
    // Both stores refuse apps that point people at a purchase outside their
    // own billing. The fallback exists; saying it inside the app does not.
    expect(availability(f, env({ platform: "androidNative" })).fallback).toBeUndefined();
  });
});

describe("the registry describes the rules the app really has", () => {
  it("every entry declares where it is enforced", () => {
    for (const [id, f] of entries()) {
      expect(["client", "server"], `${id}`).toContain(f.enforce);
    }
  });

  it("anything protecting money or data is marked server-enforced", () => {
    // Hiding a button is not access control. These four decide access to
    // money, private tooling or message contents; the registry is only the
    // UI half and must say so.
    for (const id of ["purchase", "calls", "chat.e2ee", "admin"] as FeatureId[]) {
      expect(feature(id).enforce, `${id} must not be client-only`).toBe("server");
    }
  });

  it("every blocked entry says why", () => {
    for (const [id, f] of entries()) {
      const blocks =
        f.platforms && Object.values(f.platforms).some((v) => v !== "full");
      if (blocks || f.needs || f.flag || f.requires) {
        expect(f.reason, `${id} blocks somewhere but gives no reason`).toBeTruthy();
      }
    }
  });

  it("purchases are off in both apps, and the web is never named there", () => {
    for (const platform of ["androidNative", "iosNative"] as Platform[]) {
      const v = availability(feature("purchase"), env({ platform }));
      expect(v.state).toBe("unavailable");
      expect(v.reason).toBe("Not available in the app");
      expect(v.fallback, "naming the website in the app breaks store policy").toBeUndefined();
    }
    expect(availability(feature("purchase"), env()).state).toBe("full");
  });

  it("calls may point at the web, because no store rule forbids that", () => {
    const v = availability(feature("calls"), env({ platform: "androidNative" }));
    expect(v.state).toBe("unavailable");
    expect(v.fallback).toContain("hypefy.chat");
  });

  it("recording is a capability question, so a laptop with a webcam can", () => {
    expect(isAvailable(feature("shot.capture"), env({ platform: "desktopWeb" }))).toBe(true);
    expect(
      isAvailable(feature("shot.capture"), env({ platform: "desktopWeb", capabilities: NONE })),
    ).toBe(false);
  });

  it("background upload is degraded on the web, not missing", () => {
    const webEnv = env({ platform: "mobileWeb", capabilities: { ...ALL, backgroundWork: false } });
    // The capability is absent on the web, so it reads as unavailable there;
    // what matters is that it is NOT silently treated as working.
    expect(availability(feature("upload.background"), webEnv).state).not.toBe("full");
    expect(availability(feature("upload.background"), webEnv).reason).toBeTruthy();
  });

  it("E2EE is off everywhere until the flag says otherwise", () => {
    for (const platform of PLATFORMS) {
      expect(isAvailable(feature("chat.e2ee"), env({ platform }))).toBe(false);
    }
    expect(isAvailable(feature("chat.e2ee"), env({ flags: { e2ee: true } }))).toBe(true);
  });

  it("admin needs the entitlement before anything else", () => {
    expect(isAvailable(feature("admin"), env())).toBe(false);
    expect(isAvailable(feature("admin"), env({ entitlements: new Set(["admin"]) }))).toBe(true);
  });
});

describe("the registry stays out of the adapter's way", () => {
  it("holds no entry for things that are merely implemented twice", () => {
    // Haptics, the keyboard inset, the splash screen, the back button and the
    // status bar all branch on platform, and none is an availability
    // question — they are one feature implemented twice, degrading silently
    // through safeNative(). An entry here would tell a user something is
    // unavailable when it is simply done differently.
    const ids = Object.keys(FEATURES);
    for (const notAFeature of ["haptics", "keyboard", "splash", "backButton", "statusBar"]) {
      expect(ids, `${notAFeature} is adapter plumbing, not an availability rule`).not.toContain(
        notAFeature,
      );
    }
  });

  it("and the engine knows which platforms are the apps", () => {
    expect(isNativePlatform("androidNative")).toBe(true);
    expect(isNativePlatform("iosNative")).toBe(true);
    expect(isNativePlatform("desktopWeb")).toBe(false);
  });
});

describe("it lives in core, so it works on both clients", () => {
  it("neither file touches a platform API", () => {
    // Covered in general by core-boundary.test.ts; asserted here too because
    // this is the module most tempted to reach for `window` to answer its
    // own question, rather than being handed the environment.
    for (const p of ["packages/core/src/features.ts", "packages/core/src/feature-registry.ts"]) {
      const src = readFileSync(p, "utf8");
      expect(src, p).not.toMatch(/\bwindow\.|\bnavigator\.|\bdocument\./);
      expect(src, p).not.toMatch(/from "@capacitor\//);
    }
  });
});
