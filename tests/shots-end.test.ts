// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import {
  SEEN_CAP,
  forgetSeenAtOpen,
  markShotSeen,
  orderReel,
  seenAtOpen,
  shuffled,
  type SeenAtOpen,
} from "@/lib/shots-seen";

/**
 * The end of the Shots reel: what has been watched is remembered, what is
 * new comes first, and the reel ends with a card instead of a wall.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const shots = (...ids: string[]) => ids.map((id) => ({ id }));
const seen = (ids: string[], day = 100): SeenAtOpen => ({ ids: new Set(ids), day });
const idsOf = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("remembering what was watched", () => {
  beforeEach(() => {
    localStorage.clear();
    forgetSeenAtOpen();
  });

  it("starts with nothing watched", () => {
    expect(seenAtOpen().ids.size).toBe(0);
  });

  it("is read once when the reel opens and held still while it is watched", () => {
    markShotSeen("a");
    const open = seenAtOpen();
    expect([...open.ids]).toEqual(["a"]);
    markShotSeen("b");
    // Same visit: the order must not shift under someone.
    expect(seenAtOpen()).toBe(open);
    expect(seenAtOpen().ids.has("b")).toBe(false);
    // Next visit reads afresh.
    forgetSeenAtOpen();
    expect([...seenAtOpen().ids].sort()).toEqual(["a", "b"]);
  });

  it("keeps each Shot once, and lets the oldest fall off", () => {
    markShotSeen("a");
    markShotSeen("a");
    expect(JSON.parse(localStorage.getItem("hypefy_shots_seen")!)).toEqual(["a"]);
    for (let i = 0; i < SEEN_CAP + 5; i++) markShotSeen(`s${i}`);
    const kept = JSON.parse(localStorage.getItem("hypefy_shots_seen")!) as string[];
    expect(kept).toHaveLength(SEEN_CAP);
    expect(kept).not.toContain("a");
    expect(kept[kept.length - 1]).toBe(`s${SEEN_CAP + 4}`);
  });

  /*
   * 26 Nov 2026: Naitik got "You're all caught up" with a Shot still unwatched
   * (743af00e…: shot_views had no row for him, RLS served it to him). This
   * device's list called it watched, because it marks a Shot after 1.5s on
   * screen whether or not it played, while the account's record (shot_views)
   * only counts one that played. The account's record is the one to believe.
   */
  it("believes the account's record over this device's list when it has one", () => {
    // Marked on an earlier visit: in this device's list, not in this tab.
    localStorage.setItem("hypefy_shots_seen", JSON.stringify(["unwatched"]));
    const open = seenAtOpen(["watched"]);
    expect(open.ids.has("watched")).toBe(true);
    expect(open.ids.has("unwatched")).toBe(false);
    const reel = orderReel(shots("watched", "unwatched", "new"), open);
    // Nothing the account has not watched may come after the card.
    expect(idsOf(reel.items)).toEqual(["unwatched", "new", "watched"]);
    expect(reel.caughtUpBefore).toBe("watched");
  });

  it("adds what was watched since the tab loaded to the account's record", () => {
    // The page's record can be an older render than this visit.
    markShotSeen("just-now");
    const open = seenAtOpen(["earlier"]);
    expect(open.ids.has("earlier")).toBe(true);
    expect(open.ids.has("just-now")).toBe(true);
  });

  it("falls back to this device's list when there is no account record", () => {
    markShotSeen("a");
    expect([...seenAtOpen(null).ids]).toEqual(["a"]);
    forgetSeenAtOpen();
    expect([...seenAtOpen().ids]).toEqual(["a"]);
  });

  it("survives rubbish in storage", () => {
    localStorage.setItem("hypefy_shots_seen", "{not json");
    forgetSeenAtOpen();
    expect(seenAtOpen().ids.size).toBe(0);
  });
});

describe("the order the reel plays in", () => {
  it("puts new Shots first, as they were ranked, then the watched ones", () => {
    const out = orderReel(shots("a", "b", "c", "d"), seen(["a", "c"]));
    expect(idsOf(out.items)).toEqual(["b", "d", "a", "c"]);
  });

  it("marks where the new ones give way to the watched ones", () => {
    expect(orderReel(shots("a", "b", "c"), seen(["a"])).caughtUpBefore).toBe("a");
  });

  it("has no marker when everything is new", () => {
    const out = orderReel(shots("a", "b"), seen([]));
    expect(idsOf(out.items)).toEqual(["a", "b"]);
    expect(out.caughtUpBefore).toBeNull();
  });

  it("when everything has been watched, plays them all in an order that changes by the day", () => {
    const all = shots("a", "b", "c", "d", "e", "f", "g", "h");
    const ids = idsOf(all);
    const today = orderReel(all, seen(ids, 100));
    expect(today.caughtUpBefore).toBeNull();
    expect(idsOf(today.items).sort()).toEqual(ids);
    // The same all day; different tomorrow.
    expect(idsOf(orderReel(all, seen(ids, 100)).items)).toEqual(idsOf(today.items));
    expect(idsOf(orderReel(all, seen(ids, 101)).items)).not.toEqual(idsOf(today.items));
  });

  it("Watch again is everything, reshuffled, with no marker, and differs each time", () => {
    const all = shots("a", "b", "c", "d", "e", "f", "g", "h");
    const one = orderReel(all, seen(["a"]), 1);
    const two = orderReel(all, seen(["a"]), 2);
    expect(one.caughtUpBefore).toBeNull();
    expect(idsOf(one.items).sort()).toEqual(idsOf(all));
    expect(idsOf(one.items)).not.toEqual(idsOf(two.items));
  });

  it("never loses or repeats a Shot when shuffling", () => {
    const all = shots("a", "b", "c", "d", "e");
    for (const seed of [1, 2, 3, "x"]) expect(idsOf(shuffled(all, seed)).sort()).toEqual(idsOf(all));
    expect(idsOf(all)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("the card at the end", () => {
  let root: Root;
  let host: HTMLDivElement;
  const onAgain = vi.fn();
  const onCheck = vi.fn();
  const onContinue = vi.fn();

  async function mount(props: {
    variant: "caught-up" | "end";
    thin: boolean;
    /** How many Shots the reel held. Defaults to a reel that is not bare. */
    total?: number;
    check?: "idle" | "checking" | "none";
  }) {
    const { ShotsEndCard } = await import("@/components/shots/ShotsEndCard");
    await act(async () =>
      root.render(
        createElement(ShotsEndCard, {
          check: "idle",
          total: 9,
          onAgain,
          onCheck,
          onContinue,
          ...props,
        }),
      ),
    );
  }
  const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
  /** The button that is filled in: the one the card leads with. */
  const leading = () => [...host.querySelectorAll("a, button")].filter((e) => e.className.includes("bg-accent"));

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    for (const m of [onAgain, onCheck, onContinue]) m.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("leads with Make a Shot only when the reel is nearly empty", async () => {
    await mount({ variant: "end", thin: true, total: 2 });
    expect(leading()).toHaveLength(1);
    expect(leading()[0].getAttribute("href")).toBe("/create?mode=shot");
    expect(host.textContent).toContain("add one of yours");
  });

  it("but a short reel that is not empty leads with Watch again", async () => {
    // Reported as a bug, and it was one. THIN_REEL is 20, so nine Shots
    // counted as "thin" and the card led with a big Make a Shot — which
    // reads as "there are no Shots", to somebody who has just watched nine.
    await mount({ variant: "end", thin: true, total: 9 });
    expect(leading()).toHaveLength(1);
    expect(leading()[0].textContent).toContain("Watch again");
    expect(q("[data-end-make]")).toBeTruthy();
  });

  it("and says how many there were, so it cannot read as an empty reel", async () => {
    await mount({ variant: "end", thin: true, total: 9 });
    expect(host.textContent).toContain("all 9 Shots");
    // Still honest that the catalogue is small, just not as the headline.
    expect(host.textContent).toContain("add one of yours");
  });

  it("counting one Shot in the singular", async () => {
    await mount({ variant: "end", thin: true, total: 1 });
    expect(host.textContent).toContain("all 1 Shot for now");
    expect(host.textContent).not.toContain("1 Shots");
  });

  it("leads with Watch again once there is plenty", async () => {
    await mount({ variant: "end", thin: false });
    expect(leading()).toHaveLength(1);
    expect(leading()[0].textContent).toContain("Watch again");
    expect(q("[data-end-make]")).toBeTruthy();
  });

  it("Watch again and Check for new do what they say", async () => {
    await mount({ variant: "end", thin: true });
    await act(async () => q("[data-end-again]")!.click());
    await act(async () => q("[data-end-check]")!.click());
    expect(onAgain).toHaveBeenCalledTimes(1);
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it("says so when there is nothing new, and cannot be asked twice at once", async () => {
    await mount({ variant: "end", thin: true, check: "none" });
    expect(q("[data-end-check]")!.textContent).toBe("Nothing new yet");
    await mount({ variant: "end", thin: true, check: "checking" });
    expect((q("[data-end-check]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("between new and watched, offers to keep going and nothing about checking", async () => {
    await mount({ variant: "caught-up", thin: true });
    expect(host.textContent).toContain("The ones you've watched are below");
    await act(async () => q("[data-end-continue]")!.click());
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(q("[data-end-check]")).toBeNull();
    expect(q("[data-end-again]")).toBeNull();
  });

  it("points somewhere to find more people", async () => {
    await mount({ variant: "end", thin: false });
    expect([...host.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toContain("/discover");
  });
});

describe("where it is wired", () => {
  const reel = readFileSync("src/components/shots/ReelsFeed.tsx", "utf8");

  it("only the Shots tab remembers; a linked Shot opens on that Shot", () => {
    expect(readFileSync("src/app/(app)/shots/page.tsx", "utf8")).toMatch(/<ReelsFeed[^>]*\bremember\b/);
    expect(readFileSync("src/app/(app)/shots/[shotId]/page.tsx", "utf8")).not.toMatch(/<ReelsFeed[^>]*\bremember\b/);
    expect(reel).toContain("useSyncExternalStore(noSubscribe, remember ? seenFromAccount : noSeen, noSeen)");
    expect(reel).toContain("const seenFromAccount = useCallback(() => seenAtOpen(watchedIds), [watchedIds]);");
  });

  it("the Shots tab hands the reel the account's record, null only when it has none", () => {
    const page = readFileSync("src/app/(app)/shots/page.tsx", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(page).toMatch(/<ReelsFeed[^>]*watchedIds=\{watchedRows \? \[\.\.\.watched\] : null\}/);
    // Signed in with nothing to look up is "watched nothing", not "unknown".
    expect(page).toMatch(/: user\s*\?\s*\[\]\s*:\s*null;/);
  });

  it("the cards are slides of their own, counted by the swipe", () => {
    expect(reel).toContain('if (item.kind === "post" && item.post.id === order.caughtUpBefore) out.push({ kind: "caught-up" });');
    expect(reel).toContain('if (seen && noMore && items.length > 0) out.push({ kind: "end" });');
    expect(reel).toContain("const atEnd = activeIdx === slides.length - 1 && dy < 0;");
    expect(reel).toContain("setActiveIdx((i) => Math.min(i + 1, slides.length - 1));");
  });

  it("a Shot counts as watched after a moment on screen, not at a glance", () => {
    expect(reel).toContain("const t = setTimeout(() => markShotSeen(activeShotId), SEEN_AFTER_MS);");
  });

  it("pulling up on the end card asks whether there is more", () => {
    expect(reel).toContain('slides[activeIdx]?.kind === "end") void checkForNew();');
    expect(reel).toContain('.gt("created_at", newest');
  });
});
