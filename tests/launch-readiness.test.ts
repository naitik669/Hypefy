// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync, existsSync } from "node:fs";
import { isOpenPath } from "@/lib/invite-gate";
import { RETURN_COOKIE, safeReturnPath, takeReturnPath } from "@/lib/return-path";

/**
 * Things the Play Store readiness audit found missing, kept from going
 * missing again.
 */

vi.mock("@/lib/native", () => ({ isNative: () => false }));

describe("pages Google Play asks for at a public address", () => {
  it.each(["/delete-account", "/child-safety", "/privacy", "/terms", "/guidelines"])(
    "%s opens for someone signed out, even with the invite wall up",
    (path) => {
      expect(isOpenPath(path)).toBe(true);
    },
  );

  it("the account-deletion page says where the button is and gives a way in without the app", () => {
    const page = readFileSync("src/app/(legal)/delete-account/page.tsx", "utf8");
    expect(page).toContain("/settings/account");
    expect(page).toContain("mailto:privacy@hypefy.chat");
    expect(page).toMatch(/What is deleted/);
    expect(page).toMatch(/What is kept/);
  });

  it("the child-safety page names what is banned, how to report and who to contact", () => {
    const page = readFileSync("src/app/(legal)/child-safety/page.tsx", "utf8");
    expect(page).toContain("CSAE");
    expect(page).toContain("CSAM");
    expect(page).toMatch(/How to report/);
    expect(page).toMatch(/Point of contact/);
    expect(page).toContain("mailto:grievance@hypefy.chat");
  });

  it("both are in the sitemap and linked from Settings and the guidelines", () => {
    const sitemap = readFileSync("src/app/sitemap.ts", "utf8");
    expect(sitemap).toContain("/child-safety");
    expect(sitemap).toContain("/delete-account");
    expect(readFileSync("src/app/(app)/settings/page.tsx", "utf8")).toContain('href="/child-safety"');
    expect(readFileSync("src/app/(legal)/guidelines/page.tsx", "utf8")).toContain('href="/child-safety"');
    expect(readFileSync("src/app/(legal)/privacy/page.tsx", "utf8")).toContain('href="/delete-account"');
  });
});

describe("the Android build", () => {
  it("shows people a version, not a commit", () => {
    const gradle = readFileSync("android/app/build.gradle", "utf8");
    expect(gradle).toContain('"1.0.${buildVersionCode}"');
    expect(gradle).not.toContain("rev-parse --short");
  });

  it("stays upright", () => {
    expect(readFileSync("android/app/src/main/AndroidManifest.xml", "utf8")).toContain(
      'android:screenOrientation="portrait"',
    );
  });
});

describe("house cards point somewhere real", () => {
  it("every link on a house card has a page behind it", () => {
    const src = readFileSync("src/components/feed/HouseSponsoredCard.tsx", "utf8");
    const hrefs = [...src.matchAll(/href: "(\/[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(2);
    for (const href of hrefs) {
      expect(existsSync(`src/app/(app)${href}/page.tsx`), href).toBe(true);
    }
  });
});

describe("coming back to where you were going", () => {
  it("keeps a path on this site", () => {
    expect(safeReturnPath("/messages/abc")).toBe("/messages/abc");
    expect(safeReturnPath("/settings/account?tab=1")).toBe("/settings/account?tab=1");
    expect(safeReturnPath(encodeURIComponent("/create/scheduled"))).toBe("/create/scheduled");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "%2F%2Fevil.example", "", null, "%E0%A4%A"]) {
      expect(safeReturnPath(bad)).toBeNull();
    }
  });

  it("does not come back to the places sign-in passes through anyway", () => {
    for (const p of ["/", "/home", "/onboarding", "/signin", "/setup-profile", "/api/push", "/auth/callback", "/gate"]) {
      expect(safeReturnPath(p)).toBeNull();
    }
  });

  it("is read once, then forgotten", () => {
    document.cookie = `${RETURN_COOKIE}=${encodeURIComponent("/messages/abc")}; path=/`;
    expect(takeReturnPath()).toBe("/messages/abc");
    expect(takeReturnPath()).toBeNull();
    // Exactly what the server's Set-Cookie header carries for a path with a query.
    document.cookie = `${RETURN_COOKIE}=%2Fsettings%2Faccount%3Fx%3D1; path=/`;
    expect(takeReturnPath()).toBe("/settings/account?x=1");
    // Encoded twice is not a path, and is not followed.
    document.cookie = `${RETURN_COOKIE}=%252Fsettings; path=/`;
    expect(takeReturnPath()).toBeNull();
  });

  it("the proxy notes it, and sign-in uses it", () => {
    const proxy = readFileSync("src/lib/supabase/middleware.ts", "utf8");
    expect(proxy).toContain("safeReturnPath(pathname + request.nextUrl.search)");
    // Handed over as it is: the cookie jar encodes it once, and encoding it
    // here as well produced a value that could not be read back.
    expect(proxy).toContain("redirectResponse.cookies.set(RETURN_COOKIE, wanted, {");
    expect(readFileSync("src/components/auth/AuthCard.tsx", "utf8")).toContain('takeReturnPath() ?? "/home"');
  });
});

describe("the connection notice", () => {
  let root: Root;
  let host: HTMLDivElement;
  let onLine = true;
  const notice = () => document.querySelector("[data-connection]");
  const go = (state: "online" | "offline") =>
    act(async () => {
      onLine = state === "online";
      window.dispatchEvent(new Event(state));
      await vi.advanceTimersByTimeAsync(1);
    });

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    onLine = true;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => onLine });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const { ConnectionNotice } = await import("@/components/native/ConnectionNotice");
    await act(async () => root.render(createElement(ConnectionNotice)));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  it("says nothing while there is a connection", () => {
    expect(notice()).toBeNull();
  });

  it("says so when the connection goes, for as long as it is gone", async () => {
    await go("offline");
    expect(notice()!.textContent).toBe("No connection");
    await act(async () => void (await vi.advanceTimersByTimeAsync(60_000)));
    expect(notice()!.getAttribute("data-connection")).toBe("offline");
  });

  it("confirms the return for a moment, then gets out of the way", async () => {
    const { BACK_ONLINE_MS } = await import("@/components/native/ConnectionNotice");
    await go("offline");
    await go("online");
    expect(notice()!.textContent).toBe("Back online");
    await act(async () => void (await vi.advanceTimersByTimeAsync(BACK_ONLINE_MS + 10)));
    expect(notice()).toBeNull();
  });

  it("never takes a tap from what is underneath", async () => {
    await go("offline");
    expect(notice()!.className).toContain("pointer-events-none");
  });
});

describe("report a problem", () => {
  it("opens an email to support with the build and where it happened filled in", async () => {
    const { problemMailto, SUPPORT_EMAIL } = await import("@/components/settings/ReportProblem");
    const url = problemMailto("abc123", true, "Pixel 8");
    expect(url.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`)).toBe(true);
    const body = decodeURIComponent(url.split("&body=")[1]);
    expect(body).toContain("Build: abc123");
    expect(body).toContain("Where: Android app");
    expect(body).toContain("Device: Pixel 8");
    expect(decodeURIComponent(problemMailto("x", false, "").split("&body=")[1])).toContain("Where: Web");
  });

  it("is on the Help page", () => {
    expect(readFileSync("src/app/(app)/help/page.tsx", "utf8")).toContain("<ReportProblem />");
  });
});
