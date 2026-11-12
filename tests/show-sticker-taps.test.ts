import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PRESSABLE } from "@/components/shows/LayerView";
import { CALLOUT_FLIP_Y } from "@/components/shows/StickerCallout";
import { LAYER_PLACE_MAX_Y, LAYER_TYPES } from "@/lib/show-layers";

/**
 * What a tap on a sticker does.
 *
 * Two problems. Four stickers navigated away on the first tap and took the
 * Show with them — a stray thumb on somebody's name cost you the rest of what
 * you were watching, and a Show is twelve seconds long. And two more drew as
 * if they were tappable while not being in PRESSABLE at all, so every tap went
 * straight through them to the Show underneath.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const stack = read("src/components/shows/LayerView.tsx");
const callout = read("src/components/shows/StickerCallout.tsx");
const editor = read("src/components/shows/ShowEditor.tsx");
const tray = read("src/components/shows/StickerTray.tsx");

describe("everything that looks tappable is", () => {
  it("the two that were not, now are", () => {
    expect(PRESSABLE.has("location")).toBe(true);
    expect(PRESSABLE.has("music")).toBe(true);
  });

  it("and the ones that are deliberately inert still are", () => {
    // Words and the clock let the tap through on purpose: a tap on the frame
    // means "next Show", and a caption should not swallow it.
    for (const inert of ["text", "time", "sticker"] as const) {
      expect(PRESSABLE.has(inert), inert).toBe(false);
    }
  });

  it("nothing in PRESSABLE is a type the model does not have", () => {
    for (const t of PRESSABLE) expect(LAYER_TYPES, t).toContain(t);
  });
});

describe("leaving a Show is a decision, not a mis-tap", () => {
  const wrapped = ["Mention", "Link", "Place", "Tag", "Song"];

  it.each(wrapped)("%s opens a callout before it goes anywhere", (kind) => {
    // The leading space matters: `data-kind="Mention"` contains
    // `kind="Mention"`, so the obvious assertion passed with the prop
    // renamed and the callout gone.
    expect(stack).toContain(` kind="${kind}"`);
  });

  it("and the destination stays a real link", () => {
    /*
     * These navigated correctly before this; the point is to add a step, not
     * to take over the destination. So the anchor is inside the callout and
     * nothing routes by script.
     */
    expect(callout).toContain("<a");
    expect(callout).toContain("href={href}");
    expect(callout).not.toContain("router.push");
  });

  it("anything off-site opens in a new tab and says so", () => {
    // Spread from a conditional rather than written as a JSX attribute, so
    // an internal link carries neither target nor rel.
    expect(callout).toContain('rel: "noopener noreferrer nofollow"');
    expect(callout).toContain('target: "_blank"');
    expect(callout).toContain("external ?");
    // The link and the map are the two that leave Hypefy.
    const link = stack.slice(stack.indexOf('kind="Link"'));
    expect(link.slice(0, 400)).toContain("external");
    const place = stack.slice(stack.indexOf('kind="Place"'));
    expect(place.slice(0, 400)).toContain("external");
  });

  it("while it is open, a tap anywhere closes it instead of advancing", () => {
    // Otherwise the only way out of the callout is to leave the Show, which
    // is the thing it exists to prevent.
    expect(callout).toContain('position: "fixed", inset: 0');
    expect(callout).toContain("setOpen(false)");
  });

  it("every tap on it is kept off the frame underneath", () => {
    /*
     * Each of the three parts, not a count across the file: a file-wide
     * tally of stopPropagation stayed above its threshold with the dialog's
     * own two handlers deleted, which is exactly the leak that matters —
     * a tap inside the callout would have advanced the Show.
     */
    for (const part of ['role="dialog"', "<button", 'aria-hidden']) {
      const at = callout.indexOf(part);
      expect(at, part).toBeGreaterThan(-1);
      expect(callout.slice(at, at + 420), part).toContain("stopPropagation()");
    }
    const dialog = callout.slice(callout.indexOf('role="dialog"'));
    expect(dialog.slice(0, 420)).toContain("onPointerDown={(e) => e.stopPropagation()}");
    expect(dialog.slice(0, 420)).toContain("onClick={(e) => e.stopPropagation()}");
  });
});

describe("where the callout opens", () => {
  it("below the sticker, or above it when the sticker is low", () => {
    expect(callout).toContain('bottom: "calc(100% + 11px)"');
    expect(callout).toContain('top: "calc(100% + 11px)"');
  });

  it("decided from the layer's own y, not by measuring", () => {
    // The position is already known. Reading layout back to place something
    // is a frame of work and a frame of jitter.
    const uses = stack.match(/up=\{layer\.y > CALLOUT_FLIP_Y\}/g) ?? [];
    expect(uses).toHaveLength(5);
  });

  it("and it flips before a sticker could reach the chrome", () => {
    // A sticker can be placed down to LAYER_PLACE_MAX_Y, so the flip has to
    // happen above that or a low sticker opens its callout into the caption.
    expect(CALLOUT_FLIP_Y).toBeLessThan(LAYER_PLACE_MAX_Y);
  });
});

describe("the song", () => {
  it("names itself and offers to open", () => {
    const song = stack.slice(stack.indexOf('kind="Song"'));
    expect(song.slice(0, 300)).toContain("go=\"Open song\"");
    expect(song.slice(0, 300)).toContain("/sound/${encodeURIComponent(song.id)}");
  });

  it("except in the style that draws nothing, where there is nothing to press", () => {
    expect(stack).toContain('if (editing || song.style === "only") return body;');
  });
});

describe("the place", () => {
  it("opens a map, with the area so it finds the right city", () => {
    // "Hauz Khas" alone lands somewhere else entirely.
    expect(stack).toContain('const query = [place, area].filter(Boolean).join(", ");');
    expect(stack).toContain("maps/search/?api=1&query=${encodeURIComponent(query)}");
  });
});

describe("the clock and the emoji", () => {
  it("a clock can be set, not only stamped", () => {
    // Its only previous route to a different time was delete and re-add.
    expect(editor).toContain('else if (chosenLayer?.type === "time") setClocking(g.id);');
    expect(editor).toContain("<CountdownWhen");
    // The same sheet a countdown uses, so there is one way to pick a time.
    expect(editor).toContain('from "@/components/shows/CountdownWhen"');
  });

  it("the picked time replaces the stamped one", () => {
    const pick = editor.slice(editor.indexOf("onPick={(at) => {"));
    expect(pick.slice(0, 320)).toContain("payload: { at: at.toISOString() }");
  });

  it("an emoji has a tile, a grid and one grapheme each", () => {
    expect(tray).toContain('key: "sticker", label: "Emoji"');
    expect(editor).toContain("const EMOJI = [");
    // readLayers keeps exactly one grapheme, so every entry must be one.
    const set = editor.slice(editor.indexOf("const EMOJI = ["), editor.indexOf("] as const;"));
    const chars = [...set.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(chars.length).toBeGreaterThan(8);
    for (const c of chars) {
      expect([...new Intl.Segmenter().segment(c)], c).toHaveLength(1);
    }
  });
});
