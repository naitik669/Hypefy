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

  it("is the hype button's own star, not a second drawing of one", () => {
    // Hand-drawn, the points came out spiked. The button's curve is not in
    // its path — it comes from a round join on a stroke the same colour as
    // the fill, at that weight. Reusing the component is the only way the
    // two stay the same shape.
    const hype = deck.slice(deck.indexOf('if (mark === "hype")'), deck.indexOf("const box ="));
    expect(hype).toContain("<Star");
    expect(hype).toContain("strokeWidth={2.2}");
    const card = readFileSync("src/components/feed/FeedCard.tsx", "utf8");
    expect(card, "the button's own weight").toContain("strokeWidth={2.2}");
  });

  it("its gradient is two tokens, not two hexes in a component", () => {
    expect(deck).toContain("var(--color-hype-lit)");
    expect(deck).toContain("var(--color-hype-deep)");
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("--color-hype-lit:");
    expect(css).toContain("--color-hype-deep:");
  });

  it("and one definition serves every star on the page", () => {
    // A per-instance id would mean one copy of an identical gradient per
    // face. VerifiedStar already settled this; same fixed id here.
    expect(deck).toContain('const HYPE_GRAD = "hypeStarGrad"');
    expect(deck.match(/<HypeGradientDefs \/>/g)?.length).toBe(1);
  });

  it("the stroke matches the fill, or the points go spiky", () => {
    // The curve is a round join on a same-coloured stroke. A stroke of any
    // other colour reshapes the star rather than just recolouring its edge.
    const hype = deck.slice(deck.indexOf('if (mark === "hype")'), deck.indexOf("const box ="));
    expect(hype).toContain("fill={`url(#${HYPE_GRAD})`}");
    expect(hype).toContain("stroke={`url(#${HYPE_GRAD})`}");
  });

  it("sits bare on the face — no plate, and no shadow under it", () => {
    const hype = deck.slice(deck.indexOf('if (mark === "hype")'), deck.indexOf("const box ="));
    expect(hype).not.toContain("bg-black/55");
    expect(hype).not.toContain("drop-shadow");
    expect(hype).not.toContain("boxShadow");
  });

  it("nothing in the row drops a shadow behind it any more", () => {
    // No halo on the star, no shadow under either plate. The one filter
    // left is a 1.2px edge on the white loop, which is not a drop shadow
    // doing decoration — it is the only thing keeping that loop visible
    // where the lime gradient is still brand lime at 1.5:1.
    // Scoped to the marks. The faces themselves keep the soft shadow that
    // makes them read as floating over the photo rather than stuck to it —
    // that one is older than any of this and is the float, not decoration.
    const marks = deck
      .slice(deck.indexOf("function DeckMark"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(marks).not.toContain("boxShadow");
    const shadows = marks.match(/drop-shadow\([^)]*\)/g) ?? [];
    expect(shadows.length, shadows.join(" ")).toBe(1);
    expect(shadows[0]).toContain("1.2px");
  });

  it("the rehype keeps a plate, now in the lime that is already its colour", () => {
    // RehypeIcon paints itself text-accent when active, so lime is the
    // rehype colour exactly as gold is the hype colour.
    const rehype = deck.slice(deck.indexOf("const box ="));
    expect(rehype).toContain("var(--color-accent)");
    expect(rehype).toContain("var(--color-accent-deep)");
    expect(rehype).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it("and the deep end of that lime is a token, not a hex in a component", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("--color-accent-deep:");
  });

  it("the white loop carries a shadow, because the light end is real lime", () => {
    // White on #a3e635 is 1.5:1 and the gradient's light corner sits right
    // under the upper arrow. Without something behind it, that arrow
    // dissolves into the plate.
    const rehype = deck.slice(deck.indexOf("const box ="));
    expect(rehype).toContain("drop-shadow");
  });

  it("and the loop is the rehype button's own, not a copy of its path", () => {
    // Same lesson as the star: a hand-copied path drifts from the button
    // the first time either is touched.
    expect(deck).toContain("<RehypeIcon");
    expect(deck).not.toContain("M13 18H7a2 2 0 0 1-2-2V6");
  });

  it("drawn inactive, because active paints it lime on a lime plate", () => {
    // Comments stripped: the one above this code explains the trap and
    // would satisfy the assertion on its own.
    const code = deck
      .slice(deck.indexOf("const box ="))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("active");
    expect(code).toContain("text-white");
  });
});

describe("where the two crowds sit", () => {
  const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const card = read("src/components/feed/FeedCard.tsx");
  const reel = read("src/components/shots/ReelsFeed.tsx");

  it("is one row, not two", () => {
    // Two decks side by side put six faces on a photograph, which reads as
    // clutter rather than as people.
    for (const [name, src] of [["post", card], ["shot", reel]] as const) {
      expect(src.match(/<RehypeDeck/g)?.length, name).toBe(1);
      expect(src, name).toContain("seated={faces}");
      expect(src, name).toContain("mergeDecks(");
    }
  });

  it("on a post it keeps clear of the speaker, which owns the other corner", () => {
    const deck = card.indexOf("<RehypeDeck");
    expect(deck).toBeGreaterThan(-1);
    expect(card.slice(deck - 120, deck)).toContain("left-7");
  });

  it("a tap goes wherever that face's own mark points", () => {
    // A rehype is something to reply to; a hype is a name on a list. One
    // row carries both, so one handler has to tell them apart.
    for (const [name, src] of [["post", card], ["shot", reel]] as const) {
      expect(src, name).toContain('person.mark === "hype"');
      expect(src, name).toContain("setHypedBySheet(true)");
      expect(src, name).toContain("setReplyTo(person)");
    }
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

  it("and bigger again in a Shot, which is held closer", () => {
    // The default does not reach the reel: it passes its own, so the
    // default growing would leave the Shot's faces behind.
    const reel = read("src/components/shots/ReelsFeed.tsx");
    const size = Number(reel.match(/<RehypeDeck[\s\S]{0,200}?size=\{(\d+)\}/)?.[1]);
    expect(size, "shot face size").toBeGreaterThanOrEqual(44);
  });

  it("the mark grows with the face rather than sitting at one size", () => {
    expect(deck).toContain("size={Math.round(size * scale)}");
    expect(deck).toContain("const box = Math.round(size * scale);");
    expect(deck).toContain("markScale = 0.58");
  });

  it("and is proportionally bigger in a Shot, not just bigger with it", () => {
    const reel = read("src/components/shots/ReelsFeed.tsx");
    const shot = Number(reel.match(/markScale=\{([\d.]+)\}/)?.[1]);
    const post = Number(deck.match(/markScale = ([\d.]+)/)?.[1]);
    expect(shot, "shot markScale").toBeGreaterThan(post);
  });
});
