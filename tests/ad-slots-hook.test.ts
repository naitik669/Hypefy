// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act, useState } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, createRoot, type Root } from "react-dom/client";

/**
 * The two hooks as React actually runs them, not as their pure parts do.
 *
 * The pure logic (extendAdLane, placeAds) is covered in feed-mix.test.ts. What
 * that cannot cover is the one step that only exists in a browser: the page
 * is rendered on the server with ads "off" — the server cannot know whether it
 * is inside the Android app — and must switch to the real answer after
 * hydration. If that switch never happens, every ad slot on the site is
 * silently empty and nothing errors. So this renders on the server, hydrates
 * in jsdom, and checks the switch.
 *
 * Written with react-dom directly rather than a testing library, which this
 * repo does not have; it needs nothing more than render and act.
 */

// jsdom is not a native shell, and the ads gate must not be asked to find out
// through Capacitor.
vi.mock("@/lib/native", () => ({ isNative: () => false }));

const ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ENV, NEXT_PUBLIC_ADS_MODE: "house" };
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
});
afterEach(() => {
  process.env = { ...ENV };
  document.body.innerHTML = "";
});

async function hooks() {
  return await import("@/components/feed/useAdSlots");
}

describe("useAdFill", () => {
  it("renders off on the server and the real answer after hydration", async () => {
    // The whole point of the hook. The server must say "off", because it
    // cannot tell a browser from the Android WebView; the browser must then
    // correct it, or no ad slot anywhere is ever filled.
    const { useAdFill } = await hooks();
    const Probe = () => createElement("i", { id: "fill" }, useAdFill("IN"));

    const html = renderToString(createElement(Probe));
    expect(html).toContain(">off<");

    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);

    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(host, createElement(Probe));
    });
    expect(host.querySelector("#fill")?.textContent).toBe("house");
    await act(async () => root?.unmount());
  });
});

describe("useAdSlots", () => {
  type Handle = { setCount: (n: number) => void; setReset: (k: object) => void };

  async function mount(initial: number) {
    const { useAdSlots } = await hooks();
    const handle = {} as Handle;
    let seen: { id: string; slot: number }[] = [];

    function Probe() {
      const [count, setCount] = useState(initial);
      const [reset, setReset] = useState<object>({});
      handle.setCount = setCount;
      handle.setReset = setReset;
      seen = useAdSlots({
        fill: "house",
        count,
        reserved: [],
        lane: "t",
        resetKey: reset,
        opts: { firstSlot: 4, every: 7, max: 2, minPosts: 5, gap: 2 },
      });
      return null;
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(Probe)));
    return { handle, get ads() { return seen; }, root };
  }

  it("places on first render", async () => {
    const t = await mount(30);
    expect(t.ads.map((a) => a.slot)).toEqual([4, 11]);
    await act(async () => t.root.unmount());
  });

  it("appends into new content only, and never moves an ad already placed", async () => {
    const t = await mount(30);
    const first = t.ads.map((a) => a.id);
    await act(async () => t.handle.setCount(50));
    // The first two are untouched: same ids, same order, same objects' slots.
    expect(t.ads.slice(0, 2).map((a) => a.id)).toEqual(first);
    expect(t.ads.slice(0, 2).map((a) => a.slot)).toEqual([4, 11]);
    // And nothing new landed in the 30 the reader already had.
    for (const ad of t.ads.slice(2)) expect(ad.slot).toBeGreaterThanOrEqual(30);
    await act(async () => t.root.unmount());
  });

  it("is stable across re-renders that change nothing", async () => {
    const t = await mount(30);
    const before = t.ads;
    await act(async () => t.handle.setCount(30));
    expect(t.ads).toBe(before);
    await act(async () => t.root.unmount());
  });

  it("starts over with new ids when the reset key changes", async () => {
    // A pull-to-refresh: a new page view, where reusing ids would make React
    // keep units that were already requested.
    const t = await mount(30);
    const before = t.ads.map((a) => a.id);
    await act(async () => t.handle.setReset({}));
    const after = t.ads.map((a) => a.id);
    expect(after).toHaveLength(before.length);
    for (const id of after) expect(before).not.toContain(id);
    await act(async () => t.root.unmount());
  });
});
