// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Coming back to the app leaves the screen as it was. A quick glance at
 * another app must not rebuild the page — that is what threw away the feed
 * you were reading — while a long absence still gets you fresh content.
 */

const refresh = vi.hoisted(() => vi.fn());
const listeners = vi.hoisted(() => new Map<string, (e: { isActive: boolean }) => void>());

vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
  useRouter: () => ({ refresh, back() {}, replace() {}, push() {} }),
}));
vi.mock("@/lib/native", () => ({
  isNative: () => true,
  isAndroidApp: () => false,
  safeNative: async () => null,
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (name: string, cb: (e: { isActive: boolean }) => void) => {
      listeners.set(name, cb);
      return Promise.resolve({ remove() {} });
    },
    exitApp() {},
  },
}));
vi.mock("@capacitor/status-bar", () => ({ StatusBar: {}, Style: {} }));
vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: {} }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  refresh.mockReset();
  listeners.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const { NativeShell } = await import("@/components/native/NativeShell");
  await act(async () => root.render(createElement(NativeShell)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

function awayFor(ms: number) {
  const cb = listeners.get("appStateChange")!;
  cb({ isActive: false });
  vi.advanceTimersByTime(ms);
  cb({ isActive: true });
}

describe("returning to the app", () => {
  it("leaves the screen alone after a short trip away", () => {
    awayFor(2 * 60_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes after a long absence", async () => {
    const { STALE_AFTER_MS } = await import("@/components/native/NativeShell");
    awayFor(STALE_AFTER_MS + 1000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("moving below the status bar", () => {
  it("zeroes the header gap only when the page really moved", async () => {
    const { movedBelowStatusBar } = await import("@/components/native/NativeShell");
    expect(movedBelowStatusBar(800, 764, 36)).toBe(true);
    expect(movedBelowStatusBar(800, 800, 36)).toBe(false); // already below, or edge-to-edge
    expect(movedBelowStatusBar(800, 764, 0)).toBe(false);
  });
});
