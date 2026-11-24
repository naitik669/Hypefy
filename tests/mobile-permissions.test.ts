import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";

/**
 * The app asks for nothing it does not use.
 *
 * Not a tidiness rule. Play requires a sensitive permission to have a
 * demonstrable in-app use, and a social app asking for the microphone with
 * no voice feature anywhere is both a review risk and the kind of thing
 * that loses a person's trust before they have posted anything. The
 * permission is shown on the store listing and in Android's own settings,
 * where there is nothing to point at as the reason.
 *
 * Three were being shipped for features this app does not have:
 *
 *  - **RECORD_AUDIO**, because `expo-camera`'s `recordAudioAndroid` was
 *    set true in preparation for video capture — which was then
 *    deliberately left out (a Shot needs a trim, a poster frame and an
 *    upload that survives backgrounding). The permission stayed.
 *  - **NSMicrophoneUsageDescription** on iOS, from the same plugin's
 *    `microphonePermission` string. Apple is stricter about an unused
 *    usage description than Google is about an unused permission.
 *  - **The barcode scanner**, which defaults ON and pulls in Google's ML
 *    Kit barcode dependency. Nothing in this app scans anything.
 *
 * **Each assertion below is a PAIRING, not a value.** It fails when a
 * permission is requested without the feature that needs it, and equally
 * when the feature arrives without the permission — so the day video
 * capture lands, this test is what says to turn the microphone back on,
 * rather than someone discovering it at the camera screen.
 */

const appJson = () =>
  JSON.parse(readFileSync("apps/mobile/app.json", "utf8")) as {
    expo: { plugins: (string | [string, Record<string, unknown>])[] };
  };

function cameraOptions(): Record<string, unknown> {
  const entry = appJson().expo.plugins.find(
    (p): p is [string, Record<string, unknown>] => Array.isArray(p) && p[0] === "expo-camera",
  );
  expect(entry, "expo-camera is no longer configured").toBeTruthy();
  return entry![1];
}

/** Every source file in the app, so a feature cannot hide in a new folder. */
function appSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = `${dir}/${name}`;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(path)) out.push(path);
    }
  };
  walk("apps/mobile/src");
  walk("apps/mobile/app");
  return out;
}

/** Code only: a doc comment explaining an absence must not read as the feature. */
const code = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

function appUses(pattern: RegExp): string[] {
  return appSources().filter((p) => pattern.test(code(p)));
}

describe("the microphone is not requested, because nothing records", () => {
  it("nothing in the app records audio", () => {
    // expo-camera's recordAsync, or any audio recorder.
    const recorders = appUses(/recordAsync|Audio\.Recording|requestMicrophonePermissions/);
    expect(recorders, "something records audio now").toEqual([]);
  });

  it("so Android does not ask for RECORD_AUDIO", () => {
    expect(cameraOptions().recordAudioAndroid).toBe(false);
  });

  it("and iOS declares no microphone usage either", () => {
    /*
     * The plugin turns `microphonePermission` into
     * NSMicrophoneUsageDescription. An unused usage description is
     * rejected more readily by Apple than an unused permission is by
     * Google, so the string goes rather than being left ready.
     */
    expect(cameraOptions().microphonePermission).toBeUndefined();
  });

  it("the camera rationale describes what the app actually does", () => {
    /*
     * It said "to record Shots and take photos". Recording is not
     * implemented, and a rationale that names a feature the app does not
     * have is the same problem as the permission itself: Play reads it,
     * and so does the person deciding whether to allow it.
     */
    const reason = String(cameraOptions().cameraPermission ?? "");
    expect(reason).toMatch(/photo/i);
    expect(reason, "the rationale still claims recording").not.toMatch(/record|video|sound/i);
  });
});

describe("the barcode scanner is not shipped, because nothing scans", () => {
  it("nothing in the app scans a code", () => {
    expect(appUses(/onBarcodeScanned|barcodeScannerSettings|BarCodeScanner/)).toEqual([]);
  });

  it("so it is switched off rather than left at its default", () => {
    // It defaults to TRUE, which is why this has to be stated: leaving it
    // out ships Google's ML Kit barcode dependency for nothing.
    expect(cameraOptions().barcodeScannerEnabled).toBe(false);
  });
});

describe("what the app does request, it uses", () => {
  it("the camera, which the create screen opens", () => {
    /*
     * Both halves, separately. Written as one alternation it said only
     * that EITHER appeared, so dropping the permission request while
     * keeping the view — the exact shape of "we declare a permission
     * nothing asks for" — stayed green. An `||` in an assertion is the
     * scope error wearing a different hat.
     */
    expect(appUses(/useCameraPermissions/), "nothing requests camera permission").not.toEqual([]);
    expect(appUses(/CameraView/), "nothing renders a camera").not.toEqual([]);
    expect(cameraOptions().cameraPermission).toBeTruthy();
  });

  it("notifications, which the push nudge asks for", () => {
    expect(appUses(/requestPermissionsAsync/).length).toBeGreaterThan(0);
    const plugins = appJson().expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    expect(plugins).toContain("expo-notifications");
  });

  it("and video, which is playback and needs no permission at all", () => {
    /*
     * Worth pinning: playing sound requires nothing, and it would be easy
     * to add a permission for it by mistake while reasoning about audio.
     * expo-notifications contributes RECEIVE_BOOT_COMPLETED and
     * POST_NOTIFICATIONS and nothing else — in particular no
     * SCHEDULE_EXACT_ALARM, which Play scrutinises hardest and which a
     * local-notification feature would pull in.
     */
    const manifest = readFileSync(
      "node_modules/expo-notifications/android/src/main/AndroidManifest.xml",
      "utf8",
    );
    expect(manifest).toMatch(/POST_NOTIFICATIONS/);
    expect(manifest).toMatch(/RECEIVE_BOOT_COMPLETED/);
    expect(manifest, "an exact-alarm permission would need its own Play declaration").not.toMatch(
      /SCHEDULE_EXACT_ALARM/,
    );
  });
});
