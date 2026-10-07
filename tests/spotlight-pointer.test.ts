// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { POINT_GAP_MS, POINT_LIMIT } from "@/lib/spotlight-nudge";

/**
 * The note that points at the Spotlight deck, on the screen: for people who
 * have not posted lately, the first time, then only now and then.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
let root: Root;
let host: HTMLDivElement;
const note = () => document.querySelector('[data-hint="spotlight"]');

const wait = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(40);
  });
};

async function open(ownPageAt: string | null = null) {
  const { SpotlightPointer, POINT_AFTER_MS } = await import("@/components/diary/SpotlightPointer");
  await act(async () => root.render(createElement(SpotlightPointer, { ownPageAt })));
  await wait(POINT_AFTER_MS + 20);
}
async function reopen(ownPageAt: string | null = null) {
  await act(async () => root.unmount());
  root = createRoot(host);
  await open(ownPageAt);
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "Date"] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  // The deck, where the note points.
  const deck = document.createElement("a");
  deck.setAttribute("data-coach", "spotlight");
  deck.getBoundingClientRect = () => ({ top: 500, left: 280, width: 92, height: 120, right: 372, bottom: 620 }) as DOMRect;
  document.body.appendChild(deck);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("the note on the Spotlight deck", () => {
  it("is shown the first time to someone who has not posted", async () => {
    await open();
    expect(note()!.textContent).toContain("This is Spotlight");
  });

  it("is not shown while their own page is up", async () => {
    await open(new Date(NOW - 3600_000).toISOString());
    expect(note()).toBeNull();
  });

  it("does not come back on the next visit", async () => {
    await open();
    await reopen();
    expect(note()).toBeNull();
  });

  it("comes back some days later, and stops after a few times", async () => {
    await open();
    let shown = 1;
    for (let i = 1; i <= POINT_LIMIT + 3; i++) {
      vi.setSystemTime(NOW + i * (POINT_GAP_MS + 1000));
      await reopen();
      if (note()) shown++;
    }
    expect(shown).toBe(POINT_LIMIT);
  });

  it("comes back for someone who posted, once a week has passed without another", async () => {
    await open(new Date(NOW).toISOString());
    expect(note()).toBeNull();
    vi.setSystemTime(NOW + 3 * DAY);
    await reopen();
    expect(note()).toBeNull();
    vi.setSystemTime(NOW + 8 * DAY);
    await reopen();
    expect(note()).toBeTruthy();
  });

  it("goes when the deck is touched", async () => {
    await open();
    await act(async () => {
      document.querySelector('[data-coach="spotlight"]')!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(note()).toBeNull();
  });
});
