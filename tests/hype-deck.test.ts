import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { hypersToDeck } from "@/lib/hype-proof";
import { DECK_SEATS } from "@/lib/rehype";
import type { Previewer } from "@/lib/hype-proof";

/**
 * The people you follow who hyped this, as faces that float over the photo.
 *
 * The same deck the rehypes use — the floating, the tilt, the drag, the
 * throw — with a star on each face instead of the loop. Reused rather than
 * rebuilt: a second copy of that gesture code is a second set of the bugs
 * it took to get right.
 */

const ME = "me-1";
const p = (over: Partial<Previewer> & { id: string }): Previewer => ({
  name: "Mayo",
  username: "mayo",
  avatar_url: null,
  hue: 200,
  ...over,
});

describe("turning hypers into faces", () => {
  it("carries across what a face needs to be drawn", () => {
    const [face] = hypersToDeck([p({ id: "u1", name: "Spidey", username: "spidey", hue: 42 })], ME);
    expect(face).toMatchObject({
      userId: "u1",
      name: "Spidey",
      username: "spidey",
      hue: 42,
      isMe: false,
    });
  });

  it("knows which one is you", () => {
    const faces = hypersToDeck([p({ id: "u1" }), p({ id: ME })], ME);
    expect(faces.map((f) => f.isMe)).toEqual([false, true]);
  });

  it("falls back the same way the sentence does, rather than drawing a blank", () => {
    // An avatar with no name renders its initial, and "" has none.
    expect(hypersToDeck([p({ id: "u1", name: null, username: "ghost" })], ME)[0].name).toBe("ghost");
    expect(hypersToDeck([p({ id: "u1", name: "  ", username: null })], ME)[0].name).toBe("Someone");
  });

  it("gives a missing hue the same default the line gives it", () => {
    expect(hypersToDeck([p({ id: "u1", hue: null })], ME)[0].hue).toBe(200);
  });

  it("never seats more faces than the deck has seats", () => {
    const many = Array.from({ length: 9 }, (_, i) => p({ id: `u${i}` }));
    expect(hypersToDeck(many, ME).length).toBe(DECK_SEATS);
  });

  it("and keeps the order it was given, which is already ranked", () => {
    const faces = hypersToDeck([p({ id: "a" }), p({ id: "b" }), p({ id: "c" })], ME);
    expect(faces.map((f) => f.userId)).toEqual(["a", "b", "c"]);
  });

  it("nobody hyped it, nobody is drawn", () => {
    expect(hypersToDeck([], ME)).toEqual([]);
  });
});

describe("the mark on the face", () => {
  const deck = readFileSync("src/components/feed/RehypeDeck.tsx", "utf8");

  it("is the deck's own, told which glyph to wear", () => {
    // One deck, two marks. A second copy of the float-and-throw code would
    // be a second copy of the bugs it took to get right.
    expect(deck).toContain('mark = "rehype"');
    expect(deck).toContain('mark: "rehype" | "hype"');
  });

  it("a hype wears the gold star the rest of the app hypes with", () => {
    expect(deck).toContain('mark === "hype"');
    // The palette note reserves gold for Hype and the Verified Star, and
    // HyperStar already uses this value. A lime star would be the brand
    // pop spent on the wrong thing.
    expect(deck).toContain('const HYPE_GOLD = "#FFD000"');
    expect(deck).toContain("fill={HYPE_GOLD}");
  });

  it("and sits on the face rather than on a plate beside it", () => {
    // On a dark plate it read as a grey chip stuck to a corner. A star is
    // legible as itself; it needs a rim and a shadow, not a background.
    const hype = deck.slice(deck.indexOf('if (mark === "hype")'), deck.indexOf("const box ="));
    expect(hype).not.toContain("bg-black/55");
    expect(hype).toContain("drop-shadow");
    expect(hype).toContain('stroke="rgba(0,0,0,0.5)"');
  });

  it("the rehype keeps its plate, because a thin white line needs one", () => {
    const rehype = deck.slice(deck.indexOf("const box ="));
    expect(rehype).toContain("bg-black/55");
  });

  it("and the loop is still what a rehype wears", () => {
    expect(deck).toContain("M13 18H7a2 2 0 0 1-2-2V6");
  });
});

describe("where the two crowds sit", () => {
  const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const card = read("src/components/feed/FeedCard.tsx");
  const reel = read("src/components/shots/ReelsFeed.tsx");

  it("side by side in one row, not stacked", () => {
    // Stacked, a tall post ends up with two shelves of faces.
    for (const [name, src] of [["post", card], ["shot", reel]] as const) {
      expect(src, name).toContain("seated={hypeDeck}");
      expect(src, name).toContain('mark="hype"');
      expect(src, name).toContain("flex items-end gap-3");
    }
  });

  it("on a post they keep clear of the speaker, which owns the other corner", () => {
    const deck = card.indexOf("flex items-end gap-3");
    expect(deck).toBeGreaterThan(-1);
    expect(card.slice(deck - 90, deck)).toContain("left-7");
  });

  it("a face leads to the same place every other face leads", () => {
    // Eight faces that each go somewhere different is eight doors. The
    // sheet is the one door, and it lists everyone.
    for (const src of [card, reel]) {
      expect(src).toContain("onPick={() => setHypedBySheet(true)}");
    }
  });

  it("no hypers you follow, no deck at all", () => {
    for (const src of [card, reel]) expect(src).toContain("{hypeDeck.length > 0 && (");
  });
});

describe("the line under a Shot's caption", () => {
  const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const line = read("src/components/hype/HypeProofLine.tsx");
  const reel = read("src/components/shots/ReelsFeed.tsx");

  it("carries names only — the deck above it has the faces", () => {
    // The same people twice on one screen is worse than either alone.
    expect(line).toContain("const faces = glass ? [] : previewers.slice(0, 3);");
  });

  it("is one line that truncates rather than wrapping", () => {
    expect(line).toContain("truncate whitespace-nowrap");
  });

  it("has no bubble behind it", () => {
    expect(line).not.toContain("bg-white/[0.14]");
    expect(line).not.toContain("backdrop-blur-md");
  });

  it("and is dimmer than the caption it sits under", () => {
    // The caption is what the author said; this is a footnote about it.
    expect(reel).toContain('className="text-sm text-white/90 drop-shadow"');
    expect(line).toContain("text-white/55");
  });

  it("sits below the caption, not above it", () => {
    const caption = reel.indexOf("{caption && !commentsOpen && (");
    const proof = reel.indexOf("<HypeProofLine");
    expect(caption).toBeGreaterThan(-1);
    expect(proof).toBeGreaterThan(caption);
  });
});

describe("how the faces float", () => {
  const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const deck = read("src/components/feed/RehypeDeck.tsx");
  const css = read("src/app/globals.css");

  it("slowly — a cycle you notice only if you look for it", () => {
    // The first cycles were short enough that three faces bobbing in the
    // corner pulled the eye off the photograph they sit on.
    const cycle = deck.match(/deck-float \$\{([\d.]+) \+ f\.seat \* ([\d.]+)\}s/);
    expect(cycle, "float cycle not found").not.toBeNull();
    expect(Number(cycle![1])).toBeGreaterThanOrEqual(8);
    expect(Number(cycle![2])).toBeGreaterThanOrEqual(1);
  });

  it("and barely — slower must not also mean further", () => {
    // A long slow cycle over a big distance is a drift, not a float.
    const rise = css.match(/@keyframes deck-float \{[\s\S]*?translate: 0 (-?\d+)px;/);
    expect(rise, "deck-float keyframe not found").not.toBeNull();
    expect(Math.abs(Number(rise![1]))).toBeLessThanOrEqual(4);
  });

  it("each on its own cycle, or they bob as one block", () => {
    expect(deck).toContain("f.seat * 1.1}s ease-in-out infinite");
  });

  it("big enough to be a face rather than a dot", () => {
    expect(deck).toContain("  size = 42,");
  });

  it("including in a Shot, which asks for its own size", () => {
    // The default does not reach the reel: it passes one explicitly, so
    // the default growing would have left the Shot's faces behind.
    const reel = read("src/components/shots/ReelsFeed.tsx");
    for (const n of reel.match(/<RehypeDeck[\s\S]{0,200}?size=\{(\d+)\}/g) ?? []) {
      const size = Number(n.match(/size=\{(\d+)\}/)![1]);
      expect(size, n.slice(0, 40)).toBeGreaterThanOrEqual(36);
    }
    expect(reel.match(/size=\{\d+\}/g)?.length, "both decks sized").toBeGreaterThanOrEqual(2);
  });
});
