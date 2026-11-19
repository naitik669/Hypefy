import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

/**
 * The retired Capacitor shell must not be able to reach Google Play.
 *
 * `.github/workflows/android.yml` was written when the Capacitor shell WAS
 * Hypefy on Android, and it did the right thing then: build a release APK and
 * an App Bundle on every push to main, and warn when no keystore secret was
 * set because Play rejects a debug-signed bundle.
 *
 * Phase 6 replaced that app. `apps/mobile` is the app, EAS builds it, and EAS
 * signs with credentials it stores itself — which is how 1.0.0, 1.1.0 and
 * 1.2.0 all signed correctly with no keystore secret in this repository.
 *
 * **Which inverts what is dangerous.** `KEYSTORE_BASE64` is read by nothing
 * but `android/app/build.gradle`. Setting it makes this workflow produce a
 * correctly-signed, Play-publishable App Bundle of the retired WebView app:
 * the wrong application, properly signed, on every merge, under an artifact
 * previously named "the Play Store artifact". A wrong app that Play ACCEPTS is
 * far more likely to be uploaded by mistake than one it rejects.
 *
 * The secret was also an open request on the project's own list for several
 * days, which would have armed exactly that. These assertions are the record
 * that it must not be set here.
 */

const WORKFLOW = ".github/workflows/android.yml";
const src = () => readFileSync(WORKFLOW, "utf8").replace(/\r\n/g, "\n");

/**
 * The steps, with the comments stripped.
 *
 * The standing rule in this repository, and it caught itself here on the
 * first run: `.aab` still appears in this file, in the comment that explains
 * why the bundle is no longer built. Asserting over the whole text made that
 * explanation a failure, which is the comment trap pointing the other way —
 * a comment satisfying an assertion is the usual form, a comment BREAKING one
 * is the same mistake.
 */
const steps = () =>
  src()
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

/**
 * One step's own block, comments stripped.
 *
 * Reading lines rather than steps is how a guard gets left in the file and
 * switched off: a mutation that replaced the step's `- name:` line with two
 * `if: false` steps kept every line this file asserted on, under a step that
 * never runs. Steps are delimited by their own `- ` at six spaces, so the
 * block ends at the next one — the same slicing the stylesheet checks use,
 * and the same reason they count braces rather than stopping at the first
 * plausible terminator.
 */
function step(nameFragment: string): string {
  const lines = steps().split("\n");
  const start = lines.findIndex((l) => /^ {6}- name:/.test(l) && l.includes(nameFragment));
  expect(start, `no step named like "${nameFragment}"`).toBeGreaterThan(-1);
  let end = start + 1;
  while (end < lines.length && !/^ {6}- /.test(lines[end])) end++;
  return lines.slice(start, end).join("\n");
}

describe("the retired Android workflow cannot produce a Play artifact", () => {
  it("builds no App Bundle, which is the only format Play takes", () => {
    const s = steps();
    expect(s, "bundleRelease would produce a publishable artifact").not.toMatch(/bundleRelease/);
    expect(s, "an .aab is still being uploaded").not.toMatch(/\.aab/);
    expect(s, "the Play artifact name is still here").not.toMatch(/hypefy-aab/);
    // The APK stays: it can be sideloaded or sent through Firebase App
    // Distribution, neither of which reaches the store.
    expect(s).toMatch(/assembleRelease/);
    expect(s).toMatch(/hypefy-apk/);
  });

  it("fails when the release keystore is set, rather than warning when it is not", () => {
    /*
     * Asserted inside the guard's own step. The lines being present in the
     * file says nothing: a step kept and switched off with `if: false` has
     * every one of them.
     */
    const guard = step("Refuse to sign the retired shell");
    expect(guard, "the guard no longer fires on the keystore being set").toMatch(
      /if: env\.KEYSTORE_BASE64 != ''/,
    );
    expect(guard, "the guard is switched off").not.toMatch(/if: false/);
    expect(guard).toMatch(/echo "::error/);
    expect(guard, "a hard failure, not a message in the summary").toMatch(/\n\s+exit 1\s*$/);
    // The old guard, which was correct when this shell was the app and is
    // now the wrong way round.
    expect(steps()).not.toMatch(/Warn when the bundle is debug-signed/);
  });

  it("and says where Play's artifact actually comes from", () => {
    /*
     * In the MESSAGE, not merely in the file — the header comment says the
     * same thing, and a mutation that emptied the error of its remedy left
     * an assertion over the whole file green. Ninth appearance of the
     * comment trap, and the second time in this one file: the other
     * direction, a comment BREAKING an assertion, caught the first run.
     *
     * A failure that does not say what to do instead gets worked around.
     */
    const guard = step("Refuse to sign the retired shell");
    expect(guard).toMatch(/eas build --profile production/);
    expect(guard).toMatch(/EAS does not read them/);
  });

  it("runs only when somebody asks, not on every merge", () => {
    /*
     * On every push it produced an installable build of an app nobody should
     * install, which is worse than producing nothing: an artifact named
     * hypefy-apk sitting on a green run reads as the current app.
     */
    const s = steps();
    const triggers = s.slice(s.indexOf("\non:"), s.indexOf("\njobs:"));
    expect(triggers).toMatch(/workflow_dispatch:/);
    expect(triggers, "it still builds the retired shell on every push").not.toMatch(
      /push:|branches:/,
    );
  });

  it("the header says which app this is, because the filename does not", () => {
    const s = src();
    expect(s).toMatch(/name: Android \(Capacitor shell — retired\)/);
    expect(s).toMatch(/This builds the OLD app/);
  });
});

describe("the keystore secret is the shell's alone", () => {
  it("nothing but the Capacitor Gradle build reads it", () => {
    /*
     * The claim the workflow's failure message rests on. If EAS or the Expo
     * app ever did read this secret, failing the run on its presence would
     * be wrong — so the claim is asserted rather than trusted.
     */
    expect(readFileSync("android/app/build.gradle", "utf8")).toMatch(/KEYSTORE_PATH/);
    for (const p of ["apps/mobile/eas.json", "apps/mobile/app.json"]) {
      expect(readFileSync(p, "utf8"), `${p} reads the keystore secret`).not.toMatch(
        /KEYSTORE|KEY_ALIAS|KEY_PASSWORD/,
      );
    }
    // And the other workflow does not touch it either.
    expect(readFileSync(".github/workflows/ci.yml", "utf8")).not.toMatch(/KEYSTORE/);
  });

  it("the Expo app exists, so the shell really is redundant", () => {
    // The assertion this whole file depends on: if apps/mobile were not a
    // complete app, retiring the shell would be premature.
    for (const p of [
      "apps/mobile/app/(tabs)/home.tsx",
      "apps/mobile/app/(tabs)/shots.tsx",
      "apps/mobile/app/(tabs)/messages.tsx",
      "apps/mobile/app/notifications.tsx",
      "apps/mobile/app/create.tsx",
      "apps/mobile/app/signin.tsx",
    ]) {
      expect(existsSync(p), `${p} is missing, so the shell is not redundant yet`).toBe(true);
    }
  });
});
