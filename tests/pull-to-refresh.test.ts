// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Pull to refresh only answers a downward pull. A sideways swipe between tabs
 * that dips a little on the way must not drag the page down with it.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => "/messages" }));
vi.mock("@/lib/app-version", () => ({ reloadIfNewBuild: async () => {} }));

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const { PullToRefresh } = await import("@/components/ui/PullToRefresh");
  await act(async () => root.render(createElement(PullToRefresh, null, createElement("p", { id: "inbox" }, "inbox"))));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function touch(type: string, x: number, y: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "touches", { value: type === "touchend" ? [] : [{ clientX: x, clientY: y }] });
  await act(async () => void document.getElementById("inbox")!.dispatchEvent(e));
}
const indicator = () => (document.getElementById("inbox")!.previousElementSibling as HTMLElement).style.height;

describe("PullToRefresh", () => {
  it("pulls on a downward drag", async () => {
    await touch("touchstart", 200, 100);
    await touch("touchmove", 202, 115);
    await touch("touchmove", 204, 180);
    expect(parseFloat(indicator())).toBeGreaterThan(0);
  });

  it("does not pull during a sideways swipe that dips", async () => {
    await touch("touchstart", 300, 100);
    await touch("touchmove", 280, 104);
    await touch("touchmove", 150, 130);
    expect(parseFloat(indicator() || "0")).toBe(0);
  });
});
