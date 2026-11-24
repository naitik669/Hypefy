// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";

/**
 * An install too old for the site is told to update, and only then.
 * And the one invitation to buy that the app cannot honour stays out of it.
 */

const env = vi.hoisted(() => ({ android: true, native: true, build: "400", min: 0 as number | null, fail: false }));

vi.mock("@/lib/native", () => ({ isAndroidApp: () => env.android, isNative: () => env.native }));
vi.mock("@capacitor/app", () => ({
  App: {
    getInfo: async () => {
      if (env.fail) throw new Error("no bridge");
      return { build: env.build, version: "1.0.400" };
    },
  },
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: async () => ({ data: env.min, error: null }) }),
}));

let root: Root;
let host: HTMLDivElement;
const gate = () => document.querySelector("[data-update-gate]");

async function mount() {
  const { UpdateGate } = await import("@/components/native/UpdateGate");
  await act(async () => root.render(createElement(UpdateGate)));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.assign(env, { android: true, native: true, build: "400", min: 0, fail: false });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("too old to run", () => {
  it("is only a real build below a real minimum", async () => {
    const { mustUpdate } = await import("@/components/native/UpdateGate");
    expect(mustUpdate("399", 400)).toBe(true);
    expect(mustUpdate(399, 400)).toBe(true);
    expect(mustUpdate("400", 400)).toBe(false);
    expect(mustUpdate("401", 400)).toBe(false);
  });

  it("never locks anyone out over something it could not read", async () => {
    const { mustUpdate } = await import("@/components/native/UpdateGate");
    for (const [have, need] of [
      ["400", 0],
      ["400", null],
      ["400", undefined],
      ["", 400],
      [null, 400],
      ["dev", 400],
      ["0", 400],
      ["400", -5],
      ["400", 1.5],
    ] as const) {
      expect(mustUpdate(have, need as number | null | undefined)).toBe(false);
    }
  });
});

describe("the update screen", () => {
  it("stays away while no minimum is set", async () => {
    await mount();
    expect(gate()).toBeNull();
  });

  it("stays away when this install is new enough", async () => {
    env.min = 400;
    await mount();
    expect(gate()).toBeNull();
  });

  it("covers the app when this install is older than the minimum, with a way to update", async () => {
    env.min = 412;
    await mount();
    expect(gate()!.textContent).toContain("Update Hypefy");
    const { PLAY_STORE_URL } = await import("@/components/native/UpdateGate");
    expect(gate()!.querySelector("a")!.getAttribute("href")).toBe(PLAY_STORE_URL);
    expect(PLAY_STORE_URL).toContain("id=chat.hypefy.app");
  });

  it("is never shown on the web", async () => {
    env.android = false;
    env.min = 9999;
    await mount();
    expect(gate()).toBeNull();
  });

  it("lets the app run when the check itself fails", async () => {
    env.min = 9999;
    env.fail = true;
    await mount();
    expect(gate()).toBeNull();
  });

  it("is mounted for everyone, signed in or not", () => {
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain("<UpdateGate />");
  });
});

describe("the invitation to buy", () => {
  /**
   * This was WebOnly, a platform check, and is now FeatureOnly resolving the
   * registry's `purchase` entry. The tests changed with it, deliberately:
   *
   * "shows nothing in the app" cannot be asserted through this component any
   * more, and that is an improvement rather than a loss. It used to be
   * asserted by mocking isNative() to true — a mock of a function that now
   * answers false in every client that exists, since the Capacitor shell is
   * retired. The guarantee itself moved to tests/feature-consumers.test.ts,
   * where it is proved against the phone's own adapter, which says
   * `native: true` by construction and cannot be mocked into saying
   * otherwise.
   *
   * What is still this component's job, and is still asserted here: it shows
   * the chip where buying is possible, and shows nothing in the page the
   * server sends, so no client flashes an offer and withdraws it.
   */
  async function show() {
    const { FeatureOnly } = await import("@/components/features/FeatureOnly");
    await act(async () =>
      root.render(
        createElement(FeatureOnly, { id: "purchase" }, createElement("b", { id: "chip" }, "Get verified")),
      ),
    );
  }

  it("shows its children where buying is possible", async () => {
    await show();
    expect(host.querySelector("#chip")).toBeTruthy();
  });

  it("is in the page the server sends, because every client that gets it can buy", async () => {
    /**
     * REVERSED from what WebOnly asserted, and the reason is a client that
     * stopped existing.
     *
     * WebOnly rendered nothing on the server so the Android WebView would
     * never flash an offer it could not honour — the shell served this exact
     * bundle inside the app. The shell is retired. Nothing loads this bundle
     * in an app any more, so hiding the chip for every web visitor and then
     * revealing it is a layout shift paid for a client that is gone.
     *
     * The server snapshot is the phone shape, where buying is allowed, so the
     * chip is in the first paint. It also makes this component consistent
     * with the other five call sites, which all answered "not in an app" on
     * the server already.
     *
     * The protection for the client that really cannot sell is not a guess
     * made on the server: the phone resolves the same registry through its own
     * adapter, which says native by construction. That is asserted in
     * tests/feature-consumers.test.ts.
     */
    const { FeatureOnly } = await import("@/components/features/FeatureOnly");
    expect(
      renderToString(
        createElement(FeatureOnly, { id: "purchase" }, createElement("b", null, "Get verified")),
      ),
    ).toContain("Get verified");
  });

  it("wraps Get verified on your own profile, and names the rule it obeys", () => {
    const src = readFileSync("src/components/profile/ProfileHeader.tsx", "utf8");
    expect(src).toMatch(/<FeatureOnly id="purchase">\s*<Link\s+href="\/premium"/);
    expect(src, "a platform check came back").not.toMatch(/WebOnly|isNative/);
  });
});
