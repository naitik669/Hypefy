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

describe("web only", () => {
  async function show() {
    const { WebOnly } = await import("@/components/native/WebOnly");
    await act(async () => root.render(createElement(WebOnly, null, createElement("b", { id: "chip" }, "Get verified"))));
  }

  it("shows its children on the web", async () => {
    env.native = false;
    await show();
    expect(host.querySelector("#chip")).toBeTruthy();
  });

  it("shows nothing in the app", async () => {
    env.native = true;
    await show();
    expect(host.querySelector("#chip")).toBeNull();
  });

  it("is hidden in the page the server sends, so the app never flashes it", async () => {
    env.native = false;
    const { WebOnly } = await import("@/components/native/WebOnly");
    expect(renderToString(createElement(WebOnly, null, createElement("b", null, "Get verified")))).not.toContain(
      "Get verified",
    );
  });

  it("wraps Get verified on your own profile", () => {
    const src = readFileSync("src/components/profile/ProfileHeader.tsx", "utf8");
    expect(src).toMatch(/<WebOnly>\s*<Link\s+href="\/premium"/);
  });
});
