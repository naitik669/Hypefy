// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import {
  chapterBreak,
  reelEnds,
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
    newCount?: number;
    watchedCount?: number;
    abovePoster?: string | null;
    belowPoster?: string | null;
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

  it("fills in Make a Shot only when the reel is nearly empty", async () => {
    await mount({ variant: "end", thin: true, total: 2 });
    expect(leading()).toHaveLength(1);
    expect(leading()[0].getAttribute("href")).toBe("/create?mode=shot");
    expect(host.textContent).toContain("add one of yours");
  });

  it("but a short reel that is not empty does not shout Make a Shot", async () => {
    // Reported as a bug, and it was one. THIN_REEL is 20, so nine Shots
    // counted as "thin" and the card led with a big Make a Shot — which
    // reads as "there are no Shots", to somebody who has just watched nine.
    await mount({ variant: "end", thin: true, total: 9 });
    expect(leading()).toHaveLength(0);
    expect(q("[data-end-make]")).toBeTruthy();
    // Watch again is the band at the foot, not a button competing with it.
    expect(q("[data-end-again]")!.textContent).toContain("Watch again");
  });

  it("and says how many there were, so it cannot read as an empty reel", async () => {
    await mount({ variant: "end", thin: true, total: 9 });
    expect(host.textContent).toContain("All 9 on Hypefy");
    // Still honest that the catalogue is small, just not as the headline.
    expect(host.textContent).toContain("add one of yours");
  });

  it("counting one Shot in the singular", async () => {
    await mount({ variant: "end", thin: true, total: 1 });
    expect(host.textContent).toContain("That\u2019s the only Shot");
    expect(host.textContent).not.toContain("every Shot");
  });

  /*
   * The two cards are one family: the end of the reel used to be a
   * full-stop screen, which is the card everybody reaches while Hypefy has
   * nine Shots, and is what was being read as "there is nothing here".
   */
  it("the end of the reel is the same shape as the chapter break", async () => {
    await mount({
      variant: "end",
      thin: false,
      total: 9,
      abovePoster: "https://cdn.test/last.jpg",
      belowPoster: "https://cdn.test/first.jpg",
    });
    expect(host.textContent).toContain("The last Shot");
    const styles = [...host.querySelectorAll<HTMLElement>("[style]")].map((e) => e.getAttribute("style") ?? "");
    // Above is where the reel ended; below is what Watch again plays.
    expect(styles.some((x) => x.includes("https://cdn.test/last.jpg"))).toBe(true);
    expect(styles.some((x) => x.includes("https://cdn.test/first.jpg"))).toBe(true);
    expect(q("[data-end-again]")!.getAttribute("style")).toContain("https://cdn.test/first.jpg");
  });

  it("no longer opens with the same words as the card mid-reel", async () => {
    await mount({ variant: "end", thin: false, total: 9 });
    const end = host.textContent ?? "";
    await mount({ variant: "caught-up", thin: false, newCount: 4, watchedCount: 5 });
    const mid = host.textContent ?? "";
    expect(mid).toContain("You\u2019re all caught up");
    expect(end).not.toContain("You\u2019re all caught up");
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

  it("between new and watched, it is a divider: no Watch again, no checking", async () => {
    await mount({ variant: "caught-up", thin: true, newCount: 4, watchedCount: 5 });
    await act(async () => q("[data-end-continue]")!.click());
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(q("[data-end-check]")).toBeNull();
    expect(q("[data-end-again]")).toBeNull();
  });

  it("says how many were watched and how many follow, in the right number", async () => {
    await mount({ variant: "caught-up", thin: true, newCount: 4, watchedCount: 5 });
    expect(host.textContent).toContain("All 4 new Shots watched.");
    expect(host.textContent).toContain("Below are 5 Shots from before.");
    await mount({ variant: "caught-up", thin: true, newCount: 1, watchedCount: 1 });
    expect(host.textContent).toContain("That new Shot watched.");
    expect(host.textContent).toContain("Below is 1 Shot from before.");
  });

  /*
   * The two bands are what make it a chapter break rather than a wall: the
   * Shot just watched above, the next one below. Without a poster each is
   * still a band, so the card never collapses to a plain screen.
   */
  it("shows the Shots either side of it, and still has both bands without posters", async () => {
    await mount({
      variant: "caught-up",
      thin: true,
      newCount: 4,
      watchedCount: 5,
      abovePoster: "https://cdn.test/above.jpg",
      belowPoster: "https://cdn.test/below.jpg",
    });
    const styles = [...host.querySelectorAll<HTMLElement>("[style]")].map((e) => e.getAttribute("style") ?? "");
    expect(styles.some((x) => x.includes("https://cdn.test/above.jpg"))).toBe(true);
    expect(styles.some((x) => x.includes("https://cdn.test/below.jpg"))).toBe(true);
    await mount({ variant: "caught-up", thin: true, newCount: 4, watchedCount: 5 });
    expect(host.textContent).toContain("Last new Shot");
    expect(q("[data-end-continue]")).not.toBeNull();
  });

  it("the end of the reel still offers Watch again and a check for new", async () => {
    await mount({ variant: "end", thin: false, total: 9 });
    expect(q("[data-end-again]")).not.toBeNull();
    expect(q("[data-end-check]")).not.toBeNull();
    expect(q("[data-end-continue]")).toBeNull();
  });

  it("points somewhere to find more people", async () => {
    await mount({ variant: "end", thin: false });
    expect([...host.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toContain("/discover");
  });
});

describe("the two ends of the reel", () => {
  const p = (poster: string | null) => ({ poster_url: poster });

  it("takes the last Shot and the first, which is what Watch again plays", () => {
    expect(reelEnds([p("A.jpg"), p("B.jpg"), p("C.jpg")])).toEqual({
      lastPoster: "C.jpg",
      firstPoster: "A.jpg",
    });
  });

  it("a reel of one is both ends of itself, and an empty one has neither", () => {
    expect(reelEnds([p("only.jpg")])).toEqual({ lastPoster: "only.jpg", firstPoster: "only.jpg" });
    expect(reelEnds([])).toEqual({ lastPoster: null, firstPoster: null });
  });
});

describe("what the chapter break says", () => {
  const p = (id: string, poster: string | null = null) => ({ id, poster_url: poster });

  it("counts the new ones before it and the watched ones from it", () => {
    const got = chapterBreak([p("a"), p("b"), p("c"), p("d")], "c");
    expect(got.newCount).toBe(2);
    expect(got.watchedCount).toBe(2);
  });

  it("takes its two posters from the Shots either side, not from the marked one alone", () => {
    const got = chapterBreak([p("a", "A.jpg"), p("b", "B.jpg"), p("c", "C.jpg")], "c");
    expect(got.abovePoster).toBe("B.jpg");
    expect(got.belowPoster).toBe("C.jpg");
  });

  it("has nothing to say when the reel is all new or all watched", () => {
    expect(chapterBreak([p("a"), p("b")], null)).toEqual({
      newCount: 0,
      watchedCount: 0,
      abovePoster: null,
      belowPoster: null,
    });
    // A marker for a Shot no longer in the reel is the same nothing.
    expect(chapterBreak([p("a")], "gone").newCount).toBe(0);
  });

  it("survives a Shot with no poster", () => {
    const got = chapterBreak([p("a"), p("b")], "b");
    expect(got.abovePoster).toBeNull();
    expect(got.belowPoster).toBeNull();
    expect(got.watchedCount).toBe(1);
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
    // Still clamped to the last slide; the swipe now names the index it is
    // going to, because the track has to be animated to the same place.
    expect(reel).toContain("const to = Math.min(activeIdx + 1, slides.length - 1);");
  });

  it("the card is counted over the Shots, never the reel with its ads in it", () => {
    expect(reel).toContain("chapterBreak(order.items, order.caughtUpBefore)");
    expect(reel).toContain("newCount={chapter.newCount}");
    expect(reel).toContain("chapter.belowPoster}");
  });

  /*
   * Each card shows the Shots at its own place in the reel: the chapter
   * break the two it sits between, the end card where the reel ran out and
   * the Shot it starts over on. One pair for both would put the wrong
   * Shots on one of them.
   */
  it("each card shows the Shots at its own place in the reel", () => {
    const body = reel.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(body).toContain("reelEnds(order.items)");
    expect(body).toContain('abovePoster={item.kind === "end" ? ends.lastPoster : chapter.abovePoster}');
    expect(body).toContain('belowPoster={item.kind === "end" ? ends.firstPoster : chapter.belowPoster}');
  });

  /*
   * Swiping up off the card lands on a Shot that looks exactly like a new
   * one, with the card gone. The badge is the handover — on that Shot only,
   * since on every watched Shot after it it would be noise.
   */
  it("the badge is on the first watched Shot only, and fades by itself", () => {
    const body = reel.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(body).toContain("watchedBefore={item.post.id === order.caughtUpBefore}");
    expect(body).toContain("{watchedBefore && isActive && (");
    expect(body).toContain("data-watched-pill");
    // It fades itself out, and ends hidden rather than parked on the video.
    const css = readFileSync("src/app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(body).toContain('className="watched-pill');
    expect(css).toMatch(/@keyframes watched-pill\s*\{[^}]*0%\s*\{\s*opacity:\s*0/);
    expect(css).toMatch(/@keyframes watched-pill[\s\S]*?100%\s*\{\s*opacity:\s*0;/);
    // Every rule that runs it, the reduced-motion one included: one of them
    // keeping `both` while the other lost it would leave the badge parked
    // on the video for whichever readers got that rule.
    const rules = [...css.matchAll(/\.watched-pill\s*\{\s*animation:([^;]*);/g)].map((m) => m[1]);
    expect(rules.length).toBe(2);
    for (const r of rules) expect(r).toMatch(/\bwatched-pill\s+\d+ms\b[\s\S]*\bboth\b/);
  });

  it("a Shot counts as watched after a moment on screen, not at a glance", () => {
    expect(reel).toContain("const t = setTimeout(() => markShotSeen(activeShotId), SEEN_AFTER_MS);");
  });

  it("pulling up on the end card asks whether there is more", () => {
    expect(reel).toContain('slides[activeIdx]?.kind === "end") void checkForNew();');
    expect(reel).toContain('.gt("created_at", newest');
  });
});
