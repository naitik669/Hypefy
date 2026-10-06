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

/**
 * The overlays that were written before there was a rule, and were letting
 * the app through: a drag on the cropper scrolled the page, a swipe on a
 * call changed tab, the keypad of the app lock scrolled the feed behind it.
 */
describe("the overlays that had no shield", () => {
  it("holds the page still while an account is being switched, and swallows touches", async () => {
    const { AccountSwitchOverlay } = await import("@/components/auth/AccountSwitchOverlay");
    const outside = vi.fn();
    await render(
      createElement("div", { onTouchStart: outside, onPointerDown: outside }, createElement(AccountSwitchOverlay, { name: "Maya" })),
    );
    expect(frozen()).toBe(true);
    const overlay = document.querySelector('[role="status"]')!;
    await act(async () => {
      overlay.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      overlay.dispatchEvent(new Event("touchstart", { bubbles: true }));
    });
    expect(outside).not.toHaveBeenCalled();
  });

  it("holds the page still under the cropper, and Back cancels the crop", async () => {
    const { ImageCropper } = await import("@/components/post/ImageCropper");
    const { closeTopOverlay } = await import("@/lib/overlay-stack");
    const onCancel = vi.fn();
    const outside = vi.fn();
    await render(
      createElement(
        "div",
        { onTouchMove: outside, onPointerMove: outside },
        createElement(ImageCropper, { src: "blob:photo", onCancel, onDone: () => {} }),
      ),
    );
    expect(frozen()).toBe(true);
    const cropper = document.querySelector(".fixed.inset-0")!;
    await act(async () => {
      cropper.dispatchEvent(new Event("pointermove", { bubbles: true }));
      cropper.dispatchEvent(new Event("touchmove", { bubbles: true }));
    });
    expect(outside).not.toHaveBeenCalled();

    await act(async () => { closeTopOverlay(); });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shields every full-screen surface of a call and of the app lock", async () => {
    const { readFileSync } = await import("node:fs");
    const roots = (file: string) =>
      readFileSync(file, "utf8").split("\n").filter((l) => l.includes('fixed inset-0'));
    for (const file of [
      "src/components/calls/CallProvider.tsx",
      "src/components/calls/GroupCallProvider.tsx",
      "src/components/settings/AppLockGate.tsx",
    ]) {
      const found = roots(file);
      expect(found.length, file).toBeGreaterThan(0);
      for (const line of found) expect(line, file).toContain("{...shieldProps}");
    }
    // A call takes Back for itself; the lock leaves it, so Back can still leave the app.
    expect(readFileSync("src/components/calls/CallProvider.tsx", "utf8")).toContain("useOverlayShield(true, stayOnCall)");
    expect(readFileSync("src/components/calls/GroupCallProvider.tsx", "utf8").match(/useOverlayShield\(true, stayOnCall\)/g)).toHaveLength(2);
    const lock = readFileSync("src/components/settings/AppLockGate.tsx", "utf8");
    expect(lock).toContain("useFrozenPage(armed)");
    expect(lock).not.toContain("useOverlayShield(");
  });
});
