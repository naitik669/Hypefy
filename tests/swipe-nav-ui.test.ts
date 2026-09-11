// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Swiping between tabs, as a finger does it: the page follows, the gap names
 * where you are going, a long enough swipe goes there, a short one springs
 * back.
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
function touch(type: string, x: number, y = 300) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const pts = type === "touchend" ? [] : [{ clientX: x, clientY: y }];
  Object.defineProperty(e, "touches", { value: pts });
  return act(async () => void document.getElementById("feed")!.dispatchEvent(e));
}

describe("SwipeNav", () => {
  it("moves the page with the finger and names the tab you are heading to", async () => {
    await touch("touchstart", 300);
    await touch("touchmove", 280);
    await touch("touchmove", 180);
    expect(page().style.transform).toBe("translate3d(-120px,0,0)");
    expect(document.body.textContent).toContain("Messages");
  });

  it("goes to the next tab once the swipe is long enough", async () => {
    await touch("touchstart", 380);
    await touch("touchmove", 360);
    await touch("touchmove", 200);
    await touch("touchend", 200);
    expect(push).toHaveBeenCalledWith("/messages");
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
