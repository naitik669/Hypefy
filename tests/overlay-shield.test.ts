// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { shieldProps, useFrozenPage } from "@/lib/overlay-shield";

/**
 * What it takes for the app to be properly behind an overlay: the page does
 * not scroll under it, and a touch inside it is not also delivered to
 * whatever rendered it. Both were bugs on their own sheets before they were
 * one rule.
 */

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  document.body.style.cssText = "";
  delete document.body.dataset.sheetDepth;
  delete document.body.dataset.sheetScrollY;
  vi.stubGlobal("scrollTo", () => {});
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function Freezer({ open }: { open: boolean }) {
  useFrozenPage(open);
  return null;
}
const render = (el: React.ReactNode) => act(async () => root.render(el));
const frozen = () => document.body.style.position === "fixed";

describe("useFrozenPage", () => {
  it("pins the page while the overlay is up, and lets it go after", async () => {
    await render(createElement(Freezer, { open: true }));
    expect(frozen()).toBe(true);
    await render(createElement(Freezer, { open: false }));
    expect(frozen()).toBe(false);
  });

  it("does nothing at all while nothing is open", async () => {
    await render(createElement(Freezer, { open: false }));
    expect(frozen()).toBe(false);
    expect(document.body.dataset.sheetDepth).toBeUndefined();
  });

  it("stays pinned when one of two overlays closes", async () => {
    // A picker over the comments: closing the picker must not hand the feed
    // back while the comments are still open.
    await render(
      createElement("div", null, createElement(Freezer, { open: true, key: "a" }), createElement(Freezer, { open: true, key: "b" })),
    );
    expect(frozen()).toBe(true);
    await render(
      createElement("div", null, createElement(Freezer, { open: true, key: "a" })),
    );
    expect(frozen()).toBe(true);
    await render(createElement("div", null));
    expect(frozen()).toBe(false);
  });

  it("puts the page back where it was", async () => {
    const back: number[] = [];
    vi.stubGlobal("scrollTo", (_x: number, y: number) => back.push(y));
    Object.defineProperty(window, "scrollY", { value: 820, configurable: true });
    await render(createElement(Freezer, { open: true }));
    expect(document.body.style.top).toBe("-820px");
    await render(createElement(Freezer, { open: false }));
    expect(back).toEqual([820]);
  });
});

describe("shieldProps", () => {
  it("stops a touch inside the overlay reaching whatever rendered it", async () => {
    const outside = vi.fn();
    const inside = vi.fn();
    await render(
      createElement(
        "div",
        { onTouchStart: outside, onPointerDown: outside },
        createElement("div", { ...shieldProps, id: "sheet" }, createElement("button", { onPointerDown: inside, id: "btn" })),
      ),
    );
    const btn = document.getElementById("btn")!;
    await act(async () => {
      btn.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      btn.dispatchEvent(new Event("touchstart", { bubbles: true }));
    });
    // The overlay's own button still works; the page behind hears nothing.
    expect(inside).toHaveBeenCalledTimes(1);
    expect(outside).not.toHaveBeenCalled();
  });
});
