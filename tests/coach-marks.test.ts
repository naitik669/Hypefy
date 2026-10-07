// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { boxOf, placeBubble, CoachMarks } from "@/components/ui/CoachMarks";

/**
 * Tips that point at the real control, and are finished by using it.
 */

const VIEW = { width: 390, height: 800 };
const STEPS = [
  { id: "one", target: "one", title: "First", text: "about the first", tryIt: "Tap it." },
  { id: "two", target: "two", title: "Second", text: "about the second" },
  { id: "three", target: "three", title: "Third", text: "about the third" },
];

/** jsdom lays nothing out, so a control's place is given to it. */
function control(name: string, rect: { top: number; left: number; width: number; height: number }) {
  const el = document.createElement("button");
  el.setAttribute("data-coach", name);
  el.getBoundingClientRect = () =>
    ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe("where the control is", () => {
  const el = (top: number, left = 20) =>
    ({ getBoundingClientRect: () => ({ top, left, width: 40, height: 40, right: left + 40, bottom: top + 40 }) }) as Element;

  it("is its box when it is properly on screen", () => {
    expect(boxOf(el(300), VIEW)).toEqual({ top: 300, left: 20, width: 40, height: 40 });
  });

  it("is nowhere when it has scrolled off, or is not there", () => {
    expect(boxOf(el(-200), VIEW)).toBeNull();
    expect(boxOf(el(790), VIEW)).toBeNull();
    expect(boxOf(el(300, 500), VIEW)).toBeNull();
    expect(boxOf(null, VIEW)).toBeNull();
  });
});

describe("where the bubble goes", () => {
  it("sits under the control when there is room, pointing up at its middle", () => {
    const at = placeBubble({ top: 100, left: 40, width: 40, height: 40 }, VIEW, 120);
    expect(at.below).toBe(true);
    expect(at.top).toBeGreaterThan(140);
    // The arrow is at the control's centre (x = 60), measured from the bubble's left.
    expect(at.left + at.arrow).toBe(60);
  });

  it("goes over the control when there is no room underneath", () => {
    const at = placeBubble({ top: 700, left: 40, width: 40, height: 40 }, VIEW, 120);
    expect(at.below).toBe(false);
    expect(at.top + 120).toBeLessThan(700);
  });

  it("stays on the screen for a control at either edge, arrow inside its corners", () => {
    const right = placeBubble({ top: 100, left: 360, width: 40, height: 40 }, VIEW, 120);
    expect(right.left + right.width).toBeLessThanOrEqual(VIEW.width - 12);
    expect(right.arrow).toBeLessThanOrEqual(right.width - 18);
    const left = placeBubble({ top: 100, left: -10, width: 30, height: 30 }, VIEW, 120);
    expect(left.left).toBe(12);
    expect(left.arrow).toBeGreaterThanOrEqual(18);
  });

  it("is never wider than a narrow screen allows", () => {
    expect(placeBubble({ top: 100, left: 40, width: 40, height: 40 }, { width: 240, height: 800 }, 120).width).toBe(216);
  });
});

describe("the tips, in use", () => {
  let root: Root;
  let host: HTMLDivElement;
  const mark = () => document.querySelector("[data-coach-mark]");
  const shown = () => mark()?.getAttribute("data-coach-mark") ?? null;
  const button = (label: string) =>
    [...(mark()?.querySelectorAll("button") ?? [])].find((b) => b.textContent === label) as HTMLButtonElement;
  // Twice: the tip is chosen on the first pass, and it finds its control
  // on the next frame, which is only asked for once the first has landed.
  const wait = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    });
  };

  async function mount(steps = STEPS) {
    await act(async () => root.render(createElement(CoachMarks, { steps, delayMs: 100 })));
    await wait(150);
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] });
    localStorage.clear();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: VIEW.width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: VIEW.height });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("points at the first control, with its words and what to do", async () => {
    control("one", { top: 200, left: 40, width: 40, height: 40 });
    await mount();
    expect(shown()).toBe("one");
    expect(mark()!.textContent).toContain("First");
    expect(mark()!.textContent).toContain("Tap it.");
    expect(mark()!.textContent).toContain("1 of 3");
  });

  it("never stands between a finger and the page", async () => {
    control("one", { top: 200, left: 40, width: 40, height: 40 });
    await mount();
    expect(mark()!.className).toContain("pointer-events-none");
  });

  it("using the control finishes the tip and brings up the next", async () => {
    const one = control("one", { top: 200, left: 40, width: 40, height: 40 });
    control("two", { top: 300, left: 40, width: 40, height: 40 });
    await mount();
    await act(async () => one.click());
    expect(localStorage.getItem("hypefy_hint_one")).toBe("1");
    expect(mark()).toBeNull();
    await wait(800);
    expect(shown()).toBe("two");
  });

  it("Got it moves on without doing the thing", async () => {
    control("one", { top: 200, left: 40, width: 40, height: 40 });
    control("two", { top: 300, left: 40, width: 40, height: 40 });
    await mount();
    await act(async () => button("Got it").click());
    await wait(400);
    expect(shown()).toBe("two");
  });

  it("Skip tips ends all of them, for good", async () => {
    control("one", { top: 200, left: 40, width: 40, height: 40 });
    control("two", { top: 300, left: 40, width: 40, height: 40 });
    await mount();
    await act(async () => button("Skip tips").click());
    await wait(1000);
    expect(mark()).toBeNull();
    for (const s of STEPS) expect(localStorage.getItem(`hypefy_hint_${s.id}`)).toBe("1");
  });

  it("passes over a tip whose control is not on the page, without spending it", async () => {
    control("two", { top: 300, left: 40, width: 40, height: 40 });
    await mount();
    expect(shown()).toBe("two");
    expect(localStorage.getItem("hypefy_hint_one")).toBeNull();
  });

  it("does not repeat a tip that was read, here or as one of the old cards", async () => {
    localStorage.setItem("hypefy_hint_one", "1");
    control("one", { top: 200, left: 40, width: 40, height: 40 });
    control("two", { top: 300, left: 40, width: 40, height: 40 });
    await mount();
    expect(shown()).toBe("two");
  });

  it("steps aside while its control is scrolled off the screen", async () => {
    control("one", { top: -400, left: 40, width: 40, height: 40 });
    await mount();
    expect(mark()).toBeNull();
    expect(localStorage.getItem("hypefy_hint_one")).toBeNull();
  });

  it("says nothing at all once everything has been read", async () => {
    for (const s of STEPS) localStorage.setItem(`hypefy_hint_${s.id}`, "1");
    control("one", { top: 200, left: 40, width: 40, height: 40 });
    await mount();
    expect(mark()).toBeNull();
  });
});

describe("what the tips point at", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it.each([
    ["src/components/home/ShowsRow.tsx", 'data-coach="shows"'],
    ["src/components/feed/FeedCard.tsx", 'data-coach="hype"'],
    ["src/components/feed/FeedCard.tsx", 'data-coach="save"'],
    ["src/components/diary/FloatingPages.tsx", 'data-coach="spotlight"'],
  ])("%s carries %s", (file, attr) => {
    expect(read(file)).toContain(attr);
  });

  it("every tip on Home and in Messages names a control that exists", () => {
    const all = ["src/components/home/ShowsRow.tsx", "src/components/feed/FeedCard.tsx", "src/components/diary/FloatingPages.tsx"]
      .map(read)
      .join("\n");
    for (const page of ["src/app/(app)/home/page.tsx", "src/app/(app)/messages/(inbox)/page.tsx"]) {
      const targets = [...read(page).matchAll(/target: "([a-z]+)"/g)].map((m) => m[1]);
      expect(targets.length).toBeGreaterThan(0);
      for (const t of targets) expect(all, `${page} points at ${t}`).toContain(`data-coach="${t}"`);
    }
  });

  it("the ring stops breathing for people who asked for less motion", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.animate-coach-ring \{ animation: none; \}/);
  });
});
