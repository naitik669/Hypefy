import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { LAYER_TYPES, LOOKS, DESIGN_WIDTH } from "@/lib/show-layers";
import { lookCount, lookFor, lookName, looksAgree } from "@/lib/show-looks";

/**
 * How each layer is dressed.
 *
 * Rendered and measured in a browser across all nine types and all four
 * looks — thirty-six cells. Two things that reading the code did not
 * show up: a text plate authored at 300px hung out of both sides of a
 * 260px frame, and the Cover embed's caption measured a contrast of 1.0,
 * the same colour as the picture behind it, so it was simply not there.
 * Both are pinned below.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const looks = read("src/lib/show-looks.ts");
const view = read("src/components/shows/LayerView.tsx");

/** Relative luminance, so contrast can be asserted rather than eyeballed. */
function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("every type is dressed, four ways", () => {
  it("the styling and the stored bound agree", () => {
    // LOOKS is what a stored index is validated against; show-looks is
    // what is drawn. If they disagree a layer can hold a look that has
    // no appearance, so they are checked against each other rather than
    // being two numbers somebody keeps in step by hand.
    expect(looksAgree()).toBe(true);
    for (const t of LAYER_TYPES) expect(lookCount(t), t).toBe(LOOKS[t]);
  });

  it("each look has a name the editor can show", () => {
    for (const t of LAYER_TYPES) {
      for (let i = 0; i < lookCount(t); i++) {
        expect(lookName(t, i), `${t}/${i}`).toMatch(/^[A-Z]/);
      }
    }
  });

  it("an index out of range reads as the first rather than throwing", () => {
    // Called straight from the editor while somebody is cycling.
    for (const t of LAYER_TYPES) {
      expect(lookFor(t, 99)).toBe(lookFor(t, 0));
      expect(lookFor(t, -3)).toBe(lookFor(t, 0));
      expect(lookFor(t, NaN)).toBe(lookFor(t, 0));
    }
  });
});

describe("the readable ones are readable", () => {
  it("wherever a look paints a solid ground, its words pass on it", () => {
    // The property rather than an example of it: white on #a3e635 is
    // about 1.6:1, and asserting only the arithmetic let a look quietly
    // switch its own title to white without failing anything.
    const solid = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
    let checked = 0;
    for (const t of LAYER_TYPES) {
      for (let i = 0; i < lookCount(t); i++) {
        const look = lookFor(t, i);
        for (const [slot, style] of [["title", look.title], ["sub", look.sub]] as const) {
          const ground = solid(style.background) ? style.background : look.box.background;
          if (!solid(ground) || !solid(style.color)) continue;
          checked++;
          expect(
            contrast(style.color, ground),
            `${t}/${i} ${look.name} ${slot}: ${style.color} on ${ground}`,
          ).toBeGreaterThan(4.5);
        }
      }
    }
    // The check is worthless if it silently measured nothing.
    expect(checked).toBeGreaterThan(5);
  });

  it("and the Cover embed's caption carries its own ground", () => {
    // It did not, and measured 1.0 in the browser: dark text straight on
    // the dark picture, which is to say no caption at all.
    const cover = lookFor("post", 3);
    expect(cover.name).toBe("Cover");
    expect(cover.sub.background).toBe("#a3e635");
    expect(contrast(String(cover.sub.color), "#a3e635")).toBeGreaterThan(4.5);
  });

  it("a look with no ground of its own carries a shadow instead", () => {
    // Over a photograph there is nothing to measure against, so the
    // words need their own edge.
    const bare = lookFor("music", 3);
    expect(bare.name).toBe("Bare");
    expect(String(bare.title.textShadow)).toContain("rgba(0,0,0");
  });
});

describe("a layer is written once and scaled, not sized against the screen", () => {
  it("the stack scales the whole thing", () => {
    expect(view).toContain("const k = frame.width / DESIGN_WIDTH;");
    expect(view).toContain("transform: `scale(${k})`");
    expect(view).toContain('transformOrigin: "top left"');
  });

  it("and nothing inside writes a raw pixel width against the frame", () => {
    // The text plate was authored at 300px and hung out of both sides of
    // a 260px preview.
    expect(view).toContain("maxWidth: DESIGN_WIDTH * 0.78");
    expect(view).not.toContain("maxWidth: 300");
  });

  it("a frame with no size draws nothing rather than dividing by zero", () => {
    expect(view).toContain("if (frame.width <= 0 || frame.height <= 0) return null;");
  });

  it("the design width is one number, in the model", () => {
    expect(DESIGN_WIDTH).toBe(390);
  });
});

describe("one renderer, used by both", () => {
  it("the editor turns the live parts off rather than drawing its own", () => {
    // Two renderers would be two things to keep in step, and the one
    // that drifts is always the one nobody is looking at.
    expect(view).toContain("editing?: boolean;");
    expect(view).toContain("return editing ? body : <Link href={`/u/${username}`}>{body}</Link>;");
  });

  it("and a link opens safely when it is live", () => {
    expect(view).toContain('rel="noopener noreferrer nofollow"');
    expect(view).toContain('target="_blank"');
  });

  it("the viewer draws the stack it was given", () => {
    const viewer = read("src/components/shows/ShowViewer.tsx");
    expect(viewer).toContain("const layers = useMemo(() => readLayers(show.layers), [show.layers]);");
    expect(viewer).toContain("<LayerStack layers={layers} frame={frameSize} />");
  });

  it("and the route actually fetches the column", () => {
    // Drawing a column nobody selected is a stack that is always empty.
    const route = read("src/app/(app)/shows/[showId]/page.tsx");
    expect(route).toContain("hype_count, track, layers,");
  });
});

describe("the looks are the brand's own colours", () => {
  it("stated once each, not scattered through the file", () => {
    expect(looks).toContain('const LIME = "#a3e635"');
    expect(looks).toContain('const GOLD = "#ffd000"');
    expect(looks).toContain('const INK = "#0a0a0a"');
  });

  it("and the sticker plate is the app's squircle, not a circle", () => {
    const squircle = lookFor("sticker", 1);
    expect(squircle.box.borderRadius).toBe("30%");
  });
});
