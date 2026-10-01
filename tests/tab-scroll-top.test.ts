// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { sameSection } from "@/components/layout/TabScrollTop";

/**
 * Opening a tab lands at its top — the inbox used to come up part way down
 * after reading the feed. What must not change: going back, which exists to
 * put you where you were, and moving about inside one tab.
 */

const path = vi.hoisted(() => ({ current: "/home" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));

let root: Root;
let host: HTMLDivElement;
let scrolled: number[];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  scrolled = [];
  vi.stubGlobal("scrollTo", (...args: unknown[]) => {
    scrolled.push(typeof args[1] === "number" ? (args[1] as number) : 0);
  });
  // The second pass runs on the next frame; run it at once so the test can see it.
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
    cb();
    return 1;
  });
  path.current = "/home";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function mount() {
  const { TabScrollTop } = await import("@/components/layout/TabScrollTop");
  await act(async () => root.render(createElement(TabScrollTop)));
}
async function go(to: string) {
  path.current = to;
  const { TabScrollTop } = await import("@/components/layout/TabScrollTop");
  await act(async () => root.render(createElement(TabScrollTop)));
}
const back = () => act(() => void window.dispatchEvent(new PopStateEvent("popstate")));

describe("sameSection", () => {
  it("counts a chat as part of Messages, and a post as part of Home", () => {
    expect(sameSection("/messages", "/messages/abc")).toBe(true);
    expect(sameSection("/home", "/home")).toBe(true);
    expect(sameSection("/messages", "/home")).toBe(false);
    expect(sameSection("/shots", "/profile")).toBe(false);
  });
});

describe("TabScrollTop", () => {
  it("leaves the page the session started on alone", async () => {
    await mount();
    expect(scrolled).toEqual([]);
  });

  it("goes to the top when you open another tab", async () => {
    await mount();
    await go("/messages");
    expect(scrolled.length).toBeGreaterThan(0);
    expect(scrolled.every((y) => y === 0)).toBe(true);
  });

  it("does it again on the next frame, in case the skeleton arrives after", async () => {
    await mount();
    await go("/messages");
    expect(scrolled).toHaveLength(2);
  });

  it("stays put when you move about inside a tab", async () => {
    await mount();
    await go("/messages");
    scrolled = [];
    await go("/messages/abc");
    expect(scrolled).toEqual([]);
  });

  it("leaves a page you went back to where you left it", async () => {
    await mount();
    await go("/messages");
    scrolled = [];
    await back();
    await go("/home");
    expect(scrolled).toEqual([]);
  });

  it("only forgives the one back press", async () => {
    await mount();
    await back();
    await go("/messages");
    expect(scrolled).toEqual([]);
    await go("/home");
    expect(scrolled.every((y) => y === 0)).toBe(true);
    expect(scrolled.length).toBeGreaterThan(0);
  });
});
