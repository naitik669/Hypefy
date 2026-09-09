import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The analytics gate protects a different thing from the ads gate, and it is
 * worth being explicit about which: not an ad account, but a year of reports.
 * A developer reloading /home forty times is not forty sessions, and once that
 * is in the data it cannot be taken out.
 */

const ENV = { ...process.env };

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return await import("@/lib/analytics");
}

function servingFrom(hostname: string) {
  Object.defineProperty(window, "location", {
    value: { hostname },
    writable: true,
    configurable: true,
  });
}

const ON = { NEXT_PUBLIC_GA_ID: "G-TEST", NEXT_PUBLIC_GA_DEBUG: undefined };

beforeEach(() => {
  process.env = { ...ENV };
  servingFrom("app.hypefy.chat");
});
afterEach(() => {
  process.env = { ...ENV };
});

describe("gaEnabled", () => {
  it("is off with no measurement id", async () => {
    const { gaEnabled } = await load({ ...ON, NEXT_PUBLIC_GA_ID: undefined });
    expect(gaEnabled({ country: "IN" })).toBe(false);
  });

  it("measures a reader on the live site", async () => {
    const { gaEnabled } = await load(ON);
    for (const h of ["app.hypefy.chat", "hypefy.chat", "www.hypefy.chat"]) {
      servingFrom(h);
      expect(gaEnabled({ country: "IN" })).toBe(true);
    }
  });

  it("does not measure a reader who needs a consent choice", async () => {
    // Same answer as ads, and for the same reason: there is no CMP. GA sets
    // cookies and is not strictly necessary, so it needs one.
    const { gaEnabled } = await load(ON);
    expect(gaEnabled({ country: "DE" })).toBe(false);
    expect(gaEnabled({ country: null })).toBe(false);
  });

  it("sends nothing from a developer's machine by default", async () => {
    const { gaEnabled } = await load(ON);
    for (const h of ["localhost", "127.0.0.1", "x-git-main.vercel.app"]) {
      servingFrom(h);
      expect(gaEnabled({ country: "IN" })).toBe(false);
    }
  });

  it("sends from a developer's machine when debug is asked for", async () => {
    // And only then, and the hits carry debug_mode so they land in DebugView
    // rather than the reports. Without this branch an installation could
    // never be verified: localhost has no country header, and null reads as
    // "consent required".
    const { gaEnabled } = await load({ ...ON, NEXT_PUBLIC_GA_DEBUG: "1" });
    servingFrom("localhost");
    expect(gaEnabled({ country: null })).toBe(true);
  });

  it("does not let the debug switch speak for a real reader", async () => {
    // Debug set in Production must not become a way past consent.
    const { gaEnabled } = await load({ ...ON, NEXT_PUBLIC_GA_DEBUG: "1" });
    servingFrom("app.hypefy.chat");
    expect(gaEnabled({ country: "DE" })).toBe(false);
  });
});
