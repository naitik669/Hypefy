import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isOpenPath } from "@/lib/invite-gate";
import { nativeReturnUrl } from "@hypefy/core/native-auth-link";

/**
 * A relay nobody is signed in to must get past the invite wall.
 *
 * **The fourth time this exact shape has cost something**, and
 * tests/cron-endpoints-open.test.ts names the first three: the Shows
 * reaper's eleven nightly 404s, the media verifier's 5,083 silent no-ops,
 * and the cron endpoints it was written for. Every one is the same story —
 * a caller that carries no cookie, a 401 from the gate, and a failure
 * swallowed somewhere so nothing ever said so.
 *
 * This time it was the two write-only relays. POSTing to production
 * answered 401 for both:
 *
 *  - `/api/client-error`, whose own comment says it is "deliberately NOT
 *    auth-gated: the errors most worth catching happen on /signup and
 *    /signin, where nobody is signed in yet." The gate was doing exactly
 *    what that comment forbids, and the reporter's `.catch(() => {})` —
 *    correct, because reporting must never throw — meant the loss was
 *    silent. Every client error since the gate went up was posted into a
 *    401.
 *  - `/api/csp-report`, so the report-only Content-Security-Policy added
 *    for the saved-accounts finding has been collecting nothing.
 *
 * So, as with the cron test, no hand-written list. The paths are read out
 * of the senders — the browser reporter, the CSP header, and the phone —
 * which means a fifth relay cannot be added without either being exempt or
 * failing here.
 *
 * **It was found by calling the endpoint, not by reading it.** Nothing in
 * this repository could have shown it: the route is correct, the reporter
 * is correct, the gate is correct, and the combination is broken.
 */

const read = (p: string) => readFileSync(p, "utf8");

/** Where the browser reporter posts. */
function webReporterPaths(): string[] {
  const src = read("src/components/pwa/ClientErrorReporter.tsx");
  return [...src.matchAll(/fetch\(\s*["'](\/[^"']+)["']/g)].map((m) => m[1]);
}

/** Where the CSP header sends violation reports. */
function cspReportPaths(): string[] {
  const src = read("next.config.ts");
  return [...src.matchAll(/report-uri\s+(\/[^\s"';]+)/g)].map((m) => m[1]);
}

/** Where the phone posts. It has no cookie at all, ever. */
function mobileReporterPaths(): string[] {
  const src = read("apps/mobile/src/report.ts");
  return [...src.matchAll(/REPORT_PATH = ["'](\/[^"']+)["']/g)].map((m) => m[1]);
}

describe("every unauthenticated relay is open on the invite gate", () => {
  it("the senders name at least one path each, so this test is not vacuous", () => {
    // A regex that matched nothing would make every assertion below pass
    // while checking no path at all — which is how a guard becomes
    // decoration. The same mistake a badge selector made in Phase 4a.
    expect(webReporterPaths(), "the browser reporter's fetch was not found").not.toEqual([]);
    expect(cspReportPaths(), "the CSP report-uri was not found").not.toEqual([]);
    expect(mobileReporterPaths(), "the phone's relay path was not found").not.toEqual([]);
  });

  it("the browser's error reporter", () => {
    for (const path of webReporterPaths()) {
      expect(isOpenPath(path), `${path} is gated, so reports 401 and are lost`).toBe(true);
    }
  });

  it("the CSP violation collector", () => {
    for (const path of cspReportPaths()) {
      expect(isOpenPath(path), `${path} is gated, so the CSP collects nothing`).toBe(true);
    }
  });

  it("and the phone, which never has a gate cookie at all", () => {
    /*
     * The gate cookie is set by entering a code on /gate, in a browser.
     * The app has no such page and no such cookie, so a gated relay is not
     * "mostly broken" for the phone — it can never work.
     */
    for (const path of mobileReporterPaths()) {
      expect(isOpenPath(path), `${path} is gated, so the app can never report`).toBe(true);
    }
  });

  it("opening them gives an uninvited visitor no read of anything", () => {
    /*
     * The reason this is safe, asserted rather than asserted-in-prose.
     * Both answer with nothing but `{ ok }`, and both already limit by IP,
     * so the exposure is spam into Sentry bounded by that window.
     */
    for (const [route, perHour] of [
      ["src/app/api/client-error/route.ts", 20],
      ["src/app/api/csp-report/route.ts", 60],
    ] as const) {
      const src = read(route);
      expect(src, `${route} is not rate-limited`).toMatch(
        new RegExp(`ipRateLimited\\(req, ${perHour}, 60 \\* 60 \\* 1000\\)`),
      );
      // No GET: a relay that could be read would be a different decision.
      expect(src, `${route} answers GET`).not.toMatch(/export async function GET/);
    }
  });

  it("and every other website path the phone uses, for the same reason", () => {
    /*
     * **The phone cannot pass the wall, ever.** The gate cookie is set by
     * typing a code into /gate in a browser; the app has no such page and
     * no such cookie. So this is not "mostly broken for app users" — any
     * site path the app touches either works for everyone or works for
     * nobody.
     *
     * Derived rather than listed, as the cron test does it. The app builds
     * these three ways: a template on `siteOrigin()`, the shared
     * `nativeReturnUrl` helper, and the reporter's constant. The helper is
     * CALLED rather than pattern-matched, because it is a function and a
     * regex over its call site would only prove the call exists.
     */
    const sources = [
      "apps/mobile/src/auth/AuthCard.tsx",
      "apps/mobile/app/_layout.tsx",
      "apps/mobile/src/report.ts",
    ];
    const templated = sources.flatMap((p) =>
      [...read(p).matchAll(/\$\{siteOrigin\(\)\}(\/[^`?"']*)/g)].map((m) => m[1]),
    );
    const viaHelper = new URL(nativeReturnUrl("https://app.hypefy.chat")).pathname;

    const paths = [...new Set([...templated, viaHelper, ...mobileReporterPaths()])];
    // Not vacuous: the app really does reach the site, in more than one way.
    expect(paths.length, "no website paths were found in the app").toBeGreaterThan(1);
    expect(paths).toContain("/auth/callback");

    for (const path of paths) {
      expect(isOpenPath(path), `${path} is gated, and the app can never pass the gate`).toBe(true);
    }
  });

  it("the gate still 401s an API path it has not been told to open", () => {
    // The other direction. If isOpenPath started returning true for
    // everything, every assertion above would pass and the wall would be
    // gone.
    expect(isOpenPath("/api/billing/order")).toBe(false);
    expect(isOpenPath("/api/account/delete")).toBe(false);
  });
});
