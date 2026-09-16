// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Swiping between tabs, as a finger does it: the page follows, the tab you
 * are heading for comes in at its edge, a long enough swipe goes there, a
 * short one springs back.
 */

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
  useRouter: () => ({ push, back() {}, replace() {} }),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  push.mockReset();
  Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const { SwipeNav } = await import("@/components/layout/SwipeNav");
  await act(async () => root.render(createElement(SwipeNav, null, createElement("p", { id: "feed" }, "the feed"))));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const page = () => document.getElementById("feed")!.parentElement as HTMLElement;
function touch(type: string, x: number, y = 300, on?: HTMLElement) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const pts = type === "touchend" ? [] : [{ clientX: x, clientY: y }];
  Object.defineProperty(e, "touches", { value: pts });
  const target = on ?? document.getElementById("feed")!;
  return act(async () => void target.dispatchEvent(e));
}

/** A full swipe towards the next tab, on the page or on whatever stands in. */
async function swipeToNext(on?: HTMLElement) {
  await touch("touchstart", 380, 300, on);
  await touch("touchmove", 360, 300, on);
  await touch("touchmove", 200, 300, on);
  await touch("touchend", 200, 300, on);
}
const standIn = () => document.querySelector("[data-standin]") as HTMLElement | null;

describe("SwipeNav", () => {
  it("moves the page with the finger and names the tab you are heading to", async () => {
    await touch("touchstart", 300);
    await touch("touchmove", 280);
    await touch("touchmove", 180);
    expect(page().style.transform).toBe("translate3d(-120px,0,0)");
    expect(document.body.textContent).toContain("Messages");
  });

  it("brings the destination in at the edge of the page going out, no gap between them", async () => {
    await touch("touchstart", 300);
    await touch("touchmove", 280);
    await touch("touchmove", 180);
    const inbound = document.querySelector('[data-incoming-tab="/messages"]') as HTMLElement;
    expect(inbound).toBeTruthy();
    // The page is at -120; a 400-wide page starting off the right edge is at
    // 400 - 120. The two edges touch, so nothing shows through between them.
    expect(inbound.style.transform).toBe("translate3d(280px,0,0)");
    // And what arrives is the real Messages screen taking shape, not a label
    // on black: its header, with the title already in place.
    expect(inbound.querySelector("header")?.textContent).toBe("Messages");
  });

  it("takes the destination away again when the swipe springs back", async () => {
    await touch("touchstart", 100);
    await touch("touchmove", 115);
    await touch("touchmove", 130);
    expect(document.querySelector('[data-incoming-tab="/discover"]')).toBeTruthy();
    await touch("touchend", 130);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 320));
    });
    expect(document.querySelector("[data-incoming-tab]")).toBeNull();
  });

  it("goes to the next tab once the swipe is long enough", async () => {
    await touch("touchstart", 380);
    await touch("touchmove", 360);
    await touch("touchmove", 200);
    await touch("touchend", 200);
    expect(push).toHaveBeenCalledWith("/messages");
  });

  it("counts each swipe of a quick run from the last one, not from where the run began", async () => {
    // The route never commits here — which is exactly the case that broke.
    // Three quick swipes towards Profile used to measure all three from Home
    // and push Messages every time, so that is where you ended up.
    await swipeToNext();
    expect(push).toHaveBeenLastCalledWith("/messages");
    expect(standIn()?.dataset.standin).toBe("/messages");

    await swipeToNext(standIn()!);
    expect(push).toHaveBeenLastCalledWith("/shots");

    await swipeToNext(standIn()!);
    expect(push).toHaveBeenLastCalledWith("/profile");
    expect(standIn()?.dataset.standin).toBe("/profile");
  });

  it("stops at the last tab however many more swipes it gets", async () => {
    for (let i = 0; i < 5; i++) await swipeToNext(standIn() ?? undefined);
    expect(push).toHaveBeenLastCalledWith("/profile");
    expect(push).toHaveBeenCalledTimes(3);
  });

  it("springs back from a short one, and names the tab to the left when you pull right", async () => {
    // 30px: too short to go, and under the distance a flick needs (these
    // events land in the same instant, so anything longer reads as a flick).
    await touch("touchstart", 100);
    await touch("touchmove", 115);
    await touch("touchmove", 130);
    expect(document.body.textContent).toContain("Discover");
    await touch("touchend", 130);
    expect(push).not.toHaveBeenCalled();
    expect(page().style.transform).toBe("");
  });

  it("leaves an up-and-down drag to the page", async () => {
    await touch("touchstart", 200, 300);
    await touch("touchmove", 204, 250);
    await touch("touchmove", 206, 150);
    expect(page().style.transform).toBe("");
  });
});
