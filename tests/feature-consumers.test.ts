// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { breakpoints, columns } from "@hypefy/tokens";
import { isNativePlatform, type Platform } from "@hypefy/core/features";
import { platformFor, buildEnv } from "@hypefy/core/feature-env";
import { FEATURES } from "@hypefy/core/feature-registry";
import { envHere, featureHere, nativeCapabilities } from "../apps/mobile/src/features";
import { SERVER_KEY, hostOf, webHostKey, webCapabilities } from "../src/lib/use-feature";
import { blockedReason } from "../src/lib/marketplace";

/**
 * The registry has consumers.
 *
 * Phase 3 shipped the engine and the rules (#56) and stopped there. For two
 * months nothing imported either: six availability decisions went on asking
 * Capacitor directly, which the plan's own acceptance criterion forbade —
 * "no new isNative() branch outside the registry" — and which had quietly
 * become a constant when the Capacitor shell was retired.
 *
 * These tests are about the wiring rather than the engine (tests/
 * feature-registry covers that): where the environment comes from, that the
 * phone cannot be mistaken for a browser, and that a seventh decision cannot
 * be added without going through the registry.
 */

function filesUnder(...roots: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = `${dir}/${name}`;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(path)) out.push(path);
    }
  };
  for (const r of roots) walk(r);
  return out;
}

/** Code only: a doc comment explaining a check must not read as the check. */
const code = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const ASKS_NATIVE = /\bisNative\b|isNativePlatform\(/;

describe("which platform a client thinks it is", () => {
  it("a native binary is a native platform, whatever else it knows", () => {
    expect(platformFor({ native: true, os: "android", width: 0, finePointer: false })).toBe(
      "androidNative",
    );
    expect(platformFor({ native: true, os: "ios", width: 0, finePointer: false })).toBe("iosNative");
  });

  it("an unknown OS inside a native binary is treated as native, not as web", () => {
    /*
     * The failure this prevents: answering "web" would hand that client every
     * rule the stores forbid — a marketplace with a Buy button in a binary
     * under review. Wrong-but-restrictive is recoverable; wrong-and-permissive
     * is a rejected submission.
     */
    expect(
      isNativePlatform(platformFor({ native: true, os: "web", width: 1440, finePointer: true })),
    ).toBe(true);
  });

  it("the web shapes come from the tokens' own breakpoints", () => {
    // Not numbers typed here: the layout and the rules have to agree about
    // where tablet ends, because "the admin desk needs a wider screen" is a
    // claim about the same boundary the side rail appears at.
    const web = (width: number, finePointer: boolean): Platform =>
      platformFor({ native: false, os: "web", width, finePointer });
    expect(web(breakpoints.tablet - 1, false)).toBe("mobileWeb");
    expect(web(breakpoints.tablet, false)).toBe("tabletWeb");
    expect(web(breakpoints.desktop, true)).toBe("desktopWeb");
    expect(web(breakpoints.desktop - 1, true)).toBe("tabletWeb");
  });

  it("a wide TOUCH screen is a tablet, not a desktop", () => {
    /*
     * Phase 4a made the same call for BottomSheet, which becomes a centred
     * dialog only at 1024px AND pointer:fine because "a 1024px touch tablet
     * is still a device you throw a sheet on". A feature withheld from a
     * phone for reach reasons is withheld from that tablet too.
     */
    expect(platformFor({ native: false, os: "web", width: 1440, finePointer: false })).toBe(
      "tabletWeb",
    );
    expect(platformFor({ native: false, os: "web", width: 1440, finePointer: true })).toBe(
      "desktopWeb",
    );
  });

  it("the column the app was built around is still the phone's", () => {
    // A guard on the pairing rather than on the number: if tokens ever made
    // the phone column equal the tablet breakpoint, "mobileWeb" would stop
    // describing the shape the markup assumes.
    expect(columns.phone).toBeLessThan(breakpoints.tablet);
  });
});

describe("the phone resolves the registry by construction", () => {
  /*
   * #90 recorded a latent hazard: the flag that blocks buying is Capacitor's,
   * nothing sets it now that the shell is retired, and so "the protection
   * everybody believes is in place will not apply to the client that needs
   * it". The note ended "whoever ports a marketplace to the phone has to gate
   * it themselves", which is a hope. These are the gate.
   */
  const OSES = ["android", "ios"] as const;
  const here = (id: Parameters<typeof featureHere>[0], os: (typeof OSES)[number]) =>
    featureHere(id, os).state;

  it("each phone resolves as its own platform", () => {
    /*
     * Asserted because nothing else would notice if it stopped being true.
     * Every store rule in the registry currently reads the same for Android
     * and iOS, so a version of the adapter that hard-codes one platform
     * passes every rule test here and breaks silently the first time a rule
     * differs between them — which is exactly what an Apple-specific rule
     * would be.
     */
    expect(envHere("android").platform).toBe("androidNative");
    expect(envHere("ios").platform).toBe("iosNative");
  });

  it("buying is unavailable on both phones", () => {
    for (const os of OSES) expect(here("purchase", os), os).toBe("unavailable");
  });

  it("and no context argument can turn it back on", () => {
    // Entitlements, flags and permissions are caller-supplied, so the useful
    // question is whether a caller can unlock a store rule by passing one.
    for (const os of OSES) {
      expect(
        featureHere("purchase", os, {
          entitlements: ["premium", "verified", "admin"],
          flags: { purchase: true, e2ee: true },
          permissions: { camera: "granted" },
        }).state,
        os,
      ).toBe("unavailable");
    }
  });

  it("but a context argument IS carried through, or every rule would read the same", () => {
    /*
     * The other direction, and it caught a real hole: buildEnv could drop the
     * caller's entitlements and flags entirely and every test above would
     * still pass, because they all assert things are OFF. An environment
     * builder that silently discards what it was handed makes the admin desk
     * unreachable for admins and leaves every flagged feature dark, and the
     * symptom is a permission that appears not to work.
     */
    expect(envHere("android").entitlements.has("admin")).toBe(false);
    expect(envHere("android", { entitlements: ["admin"] }).entitlements.has("admin")).toBe(true);
    expect(envHere("android", { flags: { e2ee: true } }).flags.e2ee).toBe(true);
    expect(envHere("android", { permissions: { camera: "denied" } }).permissions.camera).toBe(
      "denied",
    );
    // And it reaches the verdict, not just the environment.
    expect(here("chat.e2ee", "android")).toBe("unavailable");
    expect(featureHere("chat.e2ee", "android", { flags: { e2ee: true } }).state).toBe("full");
  });

  it("ads and calls are off on both phones too", () => {
    for (const os of OSES) {
      expect(here("ads", os), os).toBe("unavailable");
      expect(here("calls", os), os).toBe("unavailable");
    }
  });

  it("the phone never says where to buy instead", () => {
    /*
     * Both stores refuse apps that point people at a purchase outside their
     * own billing. The fallback text is real and must not be rendered here —
     * and #90 found exactly this copy shipped on the Profile tab, in the one
     * client that is submitted to a store.
     */
    for (const os of OSES) {
      const v = featureHere("purchase", os);
      expect(v.fallback, os).toBeUndefined();
      expect(v.reason).toBe("Not available in the app");
      expect(v.reason).not.toMatch(/hypefy\.chat|website/i);
    }
  });

  it("the website DOES say where to buy, because it can", () => {
    const desktop = buildEnv({
      host: { native: false, os: "web", width: 1440, finePointer: true },
      capabilities: webCapabilities(true),
    });
    expect(isNativePlatform(desktop.platform)).toBe(false);
    // Both halves: the rule is permissive here AND the fallback is sayable.
    expect(FEATURES.purchase.fallback.what).toMatch(/hypefy\.chat/);
    expect(FEATURES.purchase.fallback.unmentionableOn).toEqual(["androidNative", "iosNative"]);
  });

  it("Android can block screen capture and iOS cannot", () => {
    // A capability, not a platform: the copy must not promise what the OS
    // will not do.
    expect(nativeCapabilities("android").blockCapture).toBe(true);
    expect(nativeCapabilities("ios").blockCapture).toBe(false);
    expect(here("chat.blockCapture", "android")).toBe("full");
    expect(here("chat.blockCapture", "ios")).toBe("unavailable");
  });

  it("nothing in the phone's adapter can observe a platform", () => {
    /*
     * Asserted as an ABSENCE because that absence is the guarantee. The moment
     * this module reads Platform.OS, a device or a mock can make it answer
     * "web", and the store rules stop holding by construction. The one caller
     * that needs the OS passes it in.
     */
    const src = code("apps/mobile/src/features.ts");
    expect(src, "the adapter detects its platform now").not.toMatch(
      /Platform\.OS|from "react-native"|expo-constants|Capacitor/,
    );
    expect(src).toMatch(/native: true/);
    expect(src, "native became a variable").not.toMatch(/native: (false|os|native)\b/);
  });
});

describe("the web adapter", () => {
  it("the subscribed snapshot is a value, so the page does not re-render forever", () => {
    /*
     * useSyncExternalStore compares snapshots with Object.is. A getSnapshot
     * returning a fresh object every call — which the first draft of this did,
     * returning a Host — renders without end.
     */
    expect(typeof webHostKey()).toBe("string");
    expect(webHostKey()).toBe(webHostKey());
  });

  it("the page the server sends is the phone shape, not a desktop", () => {
    /*
     * The server cannot know which client is asking, and the restrictive
     * answer is the one that cannot show something and then withdraw it. The
     * app was built as a 480px column, so mobileWeb is what the markup
     * already assumes; answering desktopWeb there would offer the admin desk
     * in the first paint of every phone and take it away on hydration.
     */
    expect(platformFor(hostOf(SERVER_KEY))).toBe("mobileWeb");
    expect(hostOf(SERVER_KEY).finePointer).toBe(false);
  });

  it("and it parses back to the host it encoded", () => {
    expect(hostOf("1440|1")).toEqual({
      native: false,
      os: "web",
      width: 1440,
      finePointer: true,
    });
    expect(hostOf("390|0")).toEqual({ native: false, os: "web", width: 390, finePointer: false });
  });

  it("the web host is never native, and does not ask Capacitor whether it is", () => {
    /*
     * Reading Capacitor here would look like a check and be a constant:
     * nothing serves this bundle in a WebView any more. A check that cannot
     * fail is worse than no check, because it is believed.
     */
    expect(hostOf(webHostKey()).native).toBe(false);
    expect(code("src/lib/use-feature.ts"), "the web adapter detects native again").not.toMatch(
      /Capacitor|isNative/,
    );
  });

  it("a browser with no media devices has no camera", () => {
    // Capability before platform, which is what lets Shot capture work on a
    // laptop with a webcam and not on a desktop without one.
    const caps = webCapabilities(true);
    expect(caps.camera).toBe(Boolean(navigator.mediaDevices));
    expect(caps.blockCapture, "no browser can block screenshots").toBe(false);
    expect(caps.backgroundWork, "a backgrounded tab is throttled").toBe(false);
  });
});

describe("every availability decision goes through the registry", () => {
  /**
   * The closed list of files that may still ask whether they are native, each
   * with the reason it is not an availability question.
   *
   * A closed set rather than a ban, following the pattern #85 settled on for
   * non-destination routes: an exception has to NAME why it is one, and the
   * naming is what is asserted. A seventh availability decision written as a
   * platform check fails this test rather than passing review.
   */
  const ADAPTERS: Record<string, string> = {
    "src/lib/native.ts": "the seam itself",
    "src/lib/haptics.ts": "one feature implemented twice; degrades silently",
    "src/lib/native-push.ts": "FCM against VAPID - the same notification, two transports",
    "src/lib/secure-screen.ts": "calls FLAG_SECURE; the availability rule is chat.blockCapture",
    "src/lib/useKeyboardInset.ts": "layout plumbing for the native keyboard",
    "src/components/native/NativeShell.tsx": "the back gesture and the status bar",
    "src/components/native/NativeAuthLink.tsx": "which URL the OAuth round trip returns to",
    "src/components/auth/AuthCard.tsx": "where the OAuth callback comes back to",
    "src/components/pwa/PushToggle.tsx": "which push transport to register with",
    "src/components/settings/ReportProblem.tsx":
      "names the platform in a bug report; a fact, not a rule",
  };

  it("nothing outside that list asks whether it is native", () => {
    const askers = filesUnder("src").filter((p) => ASKS_NATIVE.test(code(p)));
    expect(
      askers.filter((p) => !(p in ADAPTERS)),
      "an availability decision was written as a platform check",
    ).toEqual([]);
  });

  it("and every file on the list still asks, so the list cannot rot", () => {
    // The other direction. An entry kept after its call site was migrated is
    // a licence nobody is using, and that is what makes such a list grow.
    for (const [path, why] of Object.entries(ADAPTERS)) {
      expect(code(path), `${path} no longer asks - drop it from the list (${why})`).toMatch(
        ASKS_NATIVE,
      );
    }
  });

  it("the six migrated call sites ask the registry instead", () => {
    const migrated: [string, string][] = [
      ["src/components/billing/MarketBrowse.tsx", "purchase"],
      ["src/components/billing/PremiumPlans.tsx", "purchase"],
      ["src/components/ghost/GhostShareFlow.tsx", "purchase"],
      ["src/components/messages/ChatThemePicker.tsx", "purchase"],
      ["src/components/features/FeatureOnly.tsx", "purchase"],
      ["src/components/feed/useAdSlots.ts", "ads"],
    ];
    for (const [path, id] of migrated) {
      const src = code(path);
      expect(src, `${path} does not use the hook`).toMatch(/useFeature\(/);
      expect(src, `${path} still checks the platform`).not.toMatch(ASKS_NATIVE);
      if (path.endsWith("FeatureOnly.tsx")) {
        // It takes the id from its caller, so the caller is where to look.
        expect(code("src/components/profile/ProfileHeader.tsx")).toContain(`id="${id}"`);
      } else {
        expect(src, `${path} asks for the wrong rule`).toContain(`"${id}"`);
      }
    }
  });

  it("the chat theme picker refuses BEFORE it charges, not just nearby", () => {
    /*
     * Asserting the hook is called says nothing about whether its answer is
     * acted on — #88's bell survived a mutation that kept every assertion
     * green while the body returned early. So this slices the claim function
     * and requires the refusal to come before the charge. A theme belongs to
     * a chat and is bought right there, so there is no Marketplace screen in
     * front of it to catch this.
     */
    const src = code("src/components/messages/ChatThemePicker.tsx");
    const claim = src.slice(src.indexOf("async function claim("), src.indexOf("return ("));
    const refuses = claim.indexOf('purchase.state === "unavailable"');
    const charges = claim.indexOf("await buyItem(");
    expect(refuses, "the claim path does not consult the registry").toBeGreaterThan(-1);
    expect(charges, "nothing charges, so this test is looking at the wrong function").toBeGreaterThan(-1);
    expect(refuses, "it charges before it checks").toBeLessThan(charges);
    expect(claim).toMatch(/return;/);
  });

  it("the words for a blocked purchase are the registry's, not a second copy", () => {
    /*
     * marketplace.ts used to hold the sentence, and its own comment records
     * that it previously sent people to the website and was changed because
     * the stores refuse that. A rule with store consequences should exist
     * once. Asserted through the registry rather than as a literal, so
     * changing the registry does not need this test edited - and a literal
     * re-typed in marketplace.ts fails it.
     */
    expect(blockedReason("app")).toBe(FEATURES.purchase.reason.androidNative);
    expect(code("src/lib/marketplace.ts"), "the sentence was written out again").not.toContain(
      "Not available in the app",
    );
    // The other half of blockedReason is untouched.
    expect(blockedReason("soon")).toBe("Coming soon");
  });

  it("nothing in the phone app sells or shows an ad without the adapter", () => {
    /*
     * The forward-looking half, and the one #90 asked for. The app has no
     * marketplace today; the day it grows one, this fails until the screen
     * resolves purchase through apps/mobile/src/features.ts.
     */
    const sells = filesUnder("apps/mobile/src", "apps/mobile/app").filter(
      (p) =>
        p !== "apps/mobile/src/features.ts" &&
        /razorpay|buyItem|pricePaise|checkout|adsense|AdSlot|admob/i.test(code(p)),
    );
    const ungated = sells.filter((p) => !/featureHere|envHere/.test(code(p)));
    expect(
      ungated,
      "a billing or ads surface appeared on the phone without asking the registry",
    ).toEqual([]);
  });
});
