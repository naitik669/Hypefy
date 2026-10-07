// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";

/**
 * The Spotlight deck as Messages opens. Empty, it has a little show (the
 * stack fans, the + pops, "Add your page" lands) that used to play while
 * the card was still tucked at the edge. It now slides out, waits, plays
 * the show where it can be seen, and only then goes back.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

let root: Root;
let host: HTMLDivElement;
const deck = () => host.querySelector("a") as HTMLAnchorElement;
const out = () => deck().style.transform === "none";
const show = () => deck().getAttribute("data-deck-show");
const wait = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

const page = {
  userId: "a",
  text: "hello",
  audience: "mutual" as const,
  createdAt: new Date().toISOString(),
  isSelf: false,
  name: "Aman",
  username: "aman",
  hue: 20,
  avatarUrl: null,
  track: null,
  color: null,
  imageUrl: null,
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function mount(pages: (typeof page)[], introWaitMs = 80) {
  const { FloatingPages } = await import("@/components/diary/FloatingPages");
  await act(async () => root.render(createElement(FloatingPages, { pages, introWaitMs, introHoldMs: 200 })));
}

describe("the empty deck, as Messages opens", () => {
  it("slides out and sits there before its show starts", async () => {
    await mount([]);
    expect(out()).toBe(true);
    expect(show()).toBe("wait");
  });

  it("plays the show once it has waited, still out", async () => {
    await mount([]);
    await wait(120);
    expect(show()).toBe("play");
    expect(out()).toBe(true);
  });

  it("stays out until the show is over, then goes back to the edge", async () => {
    const { INTRO_SHOW_MS, PEEK_PX } = await import("@/components/diary/FloatingPages");
    await mount([]);
    // Most of the way through the show: still out.
    await wait(80 + INTRO_SHOW_MS - 150);
    expect(out()).toBe(true);
    // A beat after it ends: tucked, with a sliver showing.
    await wait(150 + 800);
    expect(out()).toBe(false);
    expect(deck().style.transform).toBe(`translateX(${92 - PEEK_PX}px)`);
  }, 10_000);

  it("touched during the wait, it stays out and the show plays at once", async () => {
    await mount([], 5000);
    expect(show()).toBe("wait");
    await act(async () => void deck().dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 })));
    expect(show()).toBe("play");
    await wait(300);
    expect(out()).toBe(true);
  });

  it("the show is held still by a rule that covers every piece of it", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    for (const piece of ["lean", "fan-a", "fan-b", "pop", "tag"]) {
      expect(css).toContain(`[data-deck-show="wait"] .animate-page-${piece}`);
    }
    expect(css).toMatch(/\[data-deck-show="wait"\] \.animate-page-tag \{\s*animation-play-state: paused;/);
  });
});

describe("a deck with pages in it", () => {
  it("has nothing to wait for: it shows itself and goes back as before", async () => {
    await mount([page], 5000);
    expect(out()).toBe(true);
    expect(show()).toBe("play");
    await wait(260);
    expect(out()).toBe(false);
  });
});

describe("the note that points at it", () => {
  it("is on Messages, aimed at the deck, timed for when it is out", () => {
    const src = readFileSync("src/app/(app)/messages/(inbox)/page.tsx", "utf8");
    expect(src).toMatch(/<HintPointer\s+screen="messages"\s+delayMs=\{1100\}/);
    expect(src).toContain('target: "spotlight"');
    expect(readFileSync("src/components/diary/FloatingPages.tsx", "utf8")).toContain('data-coach="spotlight"');
  });
});
