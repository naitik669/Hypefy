// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { boxOf, placeBubble, HintPointer, HINT_STAYS_MS } from "@/components/ui/CoachMarks";
import {
  HINT_GAP_MS,
  HINT_GAP_VISITS,
  NO_HINTS_YET,
  hintDue,
  nextHint,
  readHintState,
  withShown,
  withVisit,
} from "@/lib/hint-schedule";
import {
  NEVER_USED,
  POINT_GAP_MS,
  POINT_LIMIT,
  POSTED_LATELY_MS,
  noteSpotlightPointed,
  noteSpotlightPosted,
  readSpotlightUse,
  shouldPoint,
  withPointed,
  withPosted,
} from "@/lib/spotlight-nudge";

/**
 * Hints: one on a first visit, then one now and then, each once. And a
 * reminder about Spotlight for people who are not using it.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const VIEW = { width: 390, height: 800 };
const always = () => true;

describe("when a hint is due", () => {
  it("is at once, on a first visit", () => {
    expect(hintDue(NO_HINTS_YET, NOW)).toBe(true);
    expect(nextHint(["a", "b"], NO_HINTS_YET, NOW, always)).toBe("a");
  });

  it("is not again on the next visit, or the one after", () => {
    let s = withShown(NO_HINTS_YET, "a", NOW);
    for (let i = 0; i < 3; i++) {
      s = withVisit(s);
      expect(nextHint(["a", "b"], s, NOW + 10 * DAY, always)).toBeNull();
    }
  });

  it("needs both the days and the visits to have passed", () => {
    const shown = withShown(NO_HINTS_YET, "a", NOW);
    const visited = { ...shown, visits: HINT_GAP_VISITS };
    // Enough visits, too soon.
    expect(hintDue(visited, NOW + HINT_GAP_MS - 1)).toBe(false);
    // Long enough, too few visits.
    expect(hintDue({ ...shown, visits: HINT_GAP_VISITS - 1 }, NOW + HINT_GAP_MS * 5)).toBe(false);
    // Both.
    expect(hintDue(visited, NOW + HINT_GAP_MS)).toBe(true);
    expect(nextHint(["a", "b"], visited, NOW + HINT_GAP_MS, always)).toBe("b");
  });

  it("never shows the same one twice, and stops when they are used up", () => {
    const s = { seen: ["a", "b"], lastAt: NOW, visits: 99 };
    expect(nextHint(["a", "b"], s, NOW + 30 * DAY, always)).toBeNull();
  });

  it("passes over one whose control is not on the screen, and keeps it for later", () => {
    expect(nextHint(["a", "b"], NO_HINTS_YET, NOW, (id) => id === "b")).toBe("b");
    expect(nextHint(["a", "b"], NO_HINTS_YET, NOW, () => false)).toBeNull();
  });

  it("being shown uses a hint up and starts the wait again", () => {
    expect(withShown({ seen: ["a"], lastAt: 1, visits: 7 }, "b", NOW)).toEqual({ seen: ["a", "b"], lastAt: NOW, visits: 0 });
  });

  it("counts tips already read as the old cards", () => {
    localStorage.clear();
    localStorage.setItem("hypefy_hint_shows", "1");
    expect(readHintState("home", ["shows", "hype"]).seen).toEqual(["shows"]);
    localStorage.clear();
  });
});

describe("where the control is, and where the note goes", () => {
  const el = (top: number, left = 20) =>
    ({ getBoundingClientRect: () => ({ top, left, width: 40, height: 40, right: left + 40, bottom: top + 40 }) }) as Element;

  it("finds a control that is on screen, and not one that has scrolled off", () => {
    expect(boxOf(el(300), VIEW)).toEqual({ top: 300, left: 20, width: 40, height: 40 });
    expect(boxOf(el(-200), VIEW)).toBeNull();
    expect(boxOf(el(790), VIEW)).toBeNull();
    expect(boxOf(null, VIEW)).toBeNull();
  });

  it("puts the note under the control, or over it when there is no room", () => {
    expect(placeBubble({ top: 100, left: 40, width: 40, height: 40 }, VIEW, 90).below).toBe(true);
    expect(placeBubble({ top: 720, left: 40, width: 40, height: 40 }, VIEW, 90).below).toBe(false);
  });

  it("keeps the note on the screen with its arrow on the control", () => {
    const mid = placeBubble({ top: 100, left: 175, width: 40, height: 40 }, VIEW, 90);
    expect(mid.left + mid.arrow).toBe(195);
    const right = placeBubble({ top: 100, left: 360, width: 40, height: 40 }, VIEW, 90);
    expect(right.left + right.width).toBeLessThanOrEqual(VIEW.width - 12);
    expect(right.arrow).toBeLessThanOrEqual(right.width - 16);
  });
});

describe("a hint on the screen", () => {
  let root: Root;
  let host: HTMLDivElement;
  const HINTS = [
    { id: "one", target: "one", text: "about the first" },
    { id: "two", target: "two", text: "about the second" },
  ];
  const note = () => document.querySelector("[data-hint]");
  const wait = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    });
  };
  function control(name: string, top = 200) {
    const el = document.createElement("button");
    el.setAttribute("data-coach", name);
    el.getBoundingClientRect = () => ({ top, left: 40, width: 40, height: 40, right: 80, bottom: top + 40 }) as DOMRect;
    document.body.appendChild(el);
    return el;
  }
  async function mount() {
    await act(async () => root.render(createElement(HintPointer, { screen: "test", hints: HINTS, delayMs: 100 })));
    await wait(150);
  }
  async function remount() {
    await act(async () => root.unmount());
    root = createRoot(host);
    await mount();
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "Date"] });
    vi.setSystemTime(NOW);
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

  it("shows the first one on a first visit, as one line by its control", async () => {
    control("one");
    await mount();
    expect(note()!.getAttribute("data-hint")).toBe("one");
    expect(note()!.textContent).toBe("about the first");
  });

  it("does not dim the screen or stand in the way of anything", async () => {
    control("one");
    await mount();
    expect(note()!.className).toContain("pointer-events-none");
    expect(note()!.innerHTML).not.toContain("9999px");
    expect(note()!.textContent).not.toMatch(/Got it|Skip|of \d/);
  });

  it("does not come back on the next visit, nor bring the next one straight after", async () => {
    control("one");
    control("two", 300);
    await mount();
    await remount();
    expect(note()).toBeNull();
  });

  it("brings the next one only after days and visits have both passed", async () => {
    control("one");
    control("two", 300);
    await mount();
    for (let i = 0; i < HINT_GAP_VISITS - 1; i++) await remount();
    vi.setSystemTime(NOW + HINT_GAP_MS + 1000);
    await remount();
    expect(note()!.getAttribute("data-hint")).toBe("two");
  });

  it("goes when its control is used", async () => {
    const one = control("one");
    await mount();
    await act(async () => {
      one.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(note()).toBeNull();
  });

  it("goes when it is dismissed", async () => {
    control("one");
    await mount();
    await act(async () => (note()!.querySelector('[aria-label="Dismiss hint"]') as HTMLButtonElement).click());
    expect(note()).toBeNull();
  });

  it("goes by itself after a few seconds", async () => {
    control("one");
    await mount();
    await wait(HINT_STAYS_MS);
    expect(note()).toBeNull();
  });

  it("says nothing when its control is not on the page, and keeps the hint for later", async () => {
    await mount();
    expect(note()).toBeNull();
    expect(readHintState("test").seen).toEqual([]);
  });
});

describe("pointing at the Spotlight deck", () => {
  beforeEach(() => localStorage.clear());

  it("points for someone who has never posted, the first time", () => {
    expect(shouldPoint(NEVER_USED, NOW)).toBe(true);
  });

  it("says nothing to someone who posted in the last week", () => {
    expect(shouldPoint({ ...NEVER_USED, postedAt: NOW - DAY }, NOW)).toBe(false);
    expect(shouldPoint({ ...NEVER_USED, postedAt: NOW - POSTED_LATELY_MS + 1 }, NOW)).toBe(false);
  });

  it("points again once a week has gone by without a post", () => {
    expect(shouldPoint({ ...NEVER_USED, postedAt: NOW - POSTED_LATELY_MS }, NOW)).toBe(true);
  });

  it("only now and then: not again until days have passed", () => {
    const shown = withPointed(NEVER_USED, NOW);
    expect(shouldPoint(shown, NOW + DAY)).toBe(false);
    expect(shouldPoint(shown, NOW + POINT_GAP_MS - 1)).toBe(false);
    expect(shouldPoint(shown, NOW + POINT_GAP_MS)).toBe(true);
  });

  it("only a few times: then it stops, however long they go without posting", () => {
    let use = NEVER_USED;
    let at = NOW;
    let shown = 0;
    for (let i = 0; i < 20; i++) {
      if (shouldPoint(use, at)) {
        use = withPointed(use, at);
        shown++;
      }
      at += POINT_GAP_MS;
    }
    expect(shown).toBe(POINT_LIMIT);
    expect(shouldPoint(use, at + 365 * DAY)).toBe(false);
  });

  it("posting starts it over: quiet for a week, then it may come back", () => {
    let use = NEVER_USED;
    for (let i = 0; i < POINT_LIMIT; i++) use = withPointed(use, NOW + i * POINT_GAP_MS);
    use = withPosted(use, NOW + 100 * DAY);
    expect(use).toEqual({ postedAt: NOW + 100 * DAY, shownAt: null, shows: 0 });
    expect(shouldPoint(use, NOW + 101 * DAY)).toBe(false);
    expect(shouldPoint(use, NOW + 108 * DAY)).toBe(true);
  });

  it("seeing the same page again does not start the count over", () => {
    const use = { postedAt: NOW, shownAt: NOW + 8 * DAY, shows: 2 };
    expect(withPosted(use, NOW)).toBe(use);
    expect(withPosted(use, NOW - DAY)).toBe(use);
  });

  it("remembers on the device, and ignores a time it cannot read", () => {
    noteSpotlightPosted("not a date");
    noteSpotlightPosted(null);
    expect(readSpotlightUse()).toEqual(NEVER_USED);
    noteSpotlightPosted(new Date(NOW).toISOString());
    noteSpotlightPointed(NOW + 9 * DAY);
    expect(readSpotlightUse()).toEqual({ postedAt: NOW, shownAt: NOW + 9 * DAY, shows: 1 });
  });
});

describe("where it is wired", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("every hint on Home names a control that exists", () => {
    const all = [
      "src/components/home/ShowsRow.tsx",
      "src/components/feed/FeedCard.tsx",
      "src/components/layout/BottomNav.tsx",
    ]
      .map(read)
      .join("\n");
    const targets = [...read("src/app/(app)/home/page.tsx").matchAll(/target: "([a-z]+)"/g)].map((m) => m[1]);
    expect(targets).toEqual(["shows", "hype", "save", "create"]);
    for (const t of targets) expect(all, `Home points at ${t}`).toContain(`data-coach="${t}"`);
  });

  it("Messages has the note and no banner, and a page being up is what is remembered", () => {
    const messages = read("src/app/(app)/messages/(inbox)/page.tsx");
    expect(messages).toContain("<SpotlightPointer ownPageAt=");
    expect(messages).not.toContain("SpotlightNudge");
    expect(read("src/components/diary/DiaryHome.tsx")).toContain("noteSpotlightPosted(");
    expect(read("src/components/diary/FloatingPages.tsx")).toContain('data-coach="spotlight"');
  });

  it("the ring and the note hold still for people who asked for less motion", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.animate-coach-ring \{ animation: none; \}\s*\.animate-hint-in \{ animation: none; \}/);
  });
});
