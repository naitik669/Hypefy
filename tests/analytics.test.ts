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
  it("always uses Hypefy's own id — the environment cannot swap the property", async () => {
    // Production's NEXT_PUBLIC_GA_ID once pointed at a different property,
    // and the site measured into it while the real one saw nothing.
    for (const v of [undefined, "", "G-9BHYTW0V95"]) {
      const { GA_ID, gaEnabled } = await load({ ...ON, NEXT_PUBLIC_GA_ID: v });
      expect(GA_ID).toBe("G-EQD7SK0DGZ");
      expect(gaEnabled({ analytics: true })).toBe(true);
    }
  });

  it("still sends nothing off the live domains with the built-in id", async () => {
    // The id being in the code is only safe because of this.
    const { gaEnabled } = await load({ ...ON, NEXT_PUBLIC_GA_ID: undefined });
    servingFrom("localhost");
    expect(gaEnabled({ analytics: true })).toBe(false);
  });


  it("measures a reader on the live site who has analytics consent", async () => {
    const { gaEnabled } = await load(ON);
    for (const h of ["app.hypefy.chat", "hypefy.chat", "www.hypefy.chat"]) {
      servingFrom(h);
      expect(gaEnabled({ analytics: true })).toBe(true);
    }
  });

  it("does not load at all without analytics consent", async () => {
    // Consent Mode "basic": no consent, no Google script — not a script that
    // has been told to hold back.
    const { gaEnabled } = await load(ON);
    expect(gaEnabled({ analytics: false })).toBe(false);
  });

  it("sends nothing from a developer's machine by default", async () => {
    const { gaEnabled } = await load(ON);
    for (const h of ["localhost", "127.0.0.1", "x-git-main.vercel.app"]) {
      servingFrom(h);
      expect(gaEnabled({ analytics: true })).toBe(false);
    }
  });

  it("sends from a developer's machine when debug is asked for", async () => {
    const { gaEnabled } = await load({ ...ON, NEXT_PUBLIC_GA_DEBUG: "1" });
    servingFrom("localhost");
    expect(gaEnabled({ analytics: false })).toBe(true);
  });

  it("does not let the debug switch speak for a real reader", async () => {
    // Debug set in Production must not become a way past consent.
    const { gaEnabled } = await load({ ...ON, NEXT_PUBLIC_GA_DEBUG: "1" });
    servingFrom("app.hypefy.chat");
    expect(gaEnabled({ analytics: false })).toBe(false);
  });
});
