import { describe, it, expect } from "vitest";
import { ambientTint, contrastWithWhite } from "@/lib/ambient";
import { AMBIENT_LOOK, COLOUR_LOOKS, LOOKS, readLayers } from "@/lib/show-layers";
import { COLOUR_SWATCHES, lookFor, usesColours } from "@/lib/show-looks";

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

describe("the eight sticker colours", () => {
  it("chips and cards pick from eight, in the editor's order, Night first", () => {
    for (const t of ["music", "mention", "link", "poll", "question"] as const) {
      expect(LOOKS[t]).toBe(COLOUR_LOOKS);
      expect(usesColours(t)).toBe(true);
      expect(lookFor(t, 0).name).toBe("Night");
    }
    expect(COLOUR_SWATCHES.map((s) => s.name)).toEqual(["Night", "Lime", "Glass", "White", "Ambient", "Sunset", "Aurora", "Grape"]);
    expect(COLOUR_SWATCHES[AMBIENT_LOOK].name).toBe("Ambient");
  });

  it("words, stickers and embeds keep their own looks", () => {
    for (const t of ["text", "sticker", "post", "shot"] as const) expect(usesColours(t)).toBe(false);
  });

  it("Ambient wears the layer's own colour, and only Ambient does", () => {
    expect(lookFor("poll", AMBIENT_LOOK, "#40220f").box.background).toBe("#40220f");
    expect(lookFor("poll", 0, "#40220f").box.background).not.toBe("#40220f");
  });
});

describe("the Ambient colour", () => {
  it("is always deep enough for white words, whatever the photo", () => {
    for (const hex of ["#ffffff", "#ffd000", "#a3e635", "#f07d1f", "#38bdf8", "#000000", "#808080", "#ff00ff"]) {
      expect(contrastWithWhite(rgb(ambientTint(rgb(hex)))), hex).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the photo's hue", () => {
    const t = rgb(ambientTint({ r: 240, g: 125, b: 31 }));
    expect(t.r).toBeGreaterThan(t.b);
  });

  it("is stored on the layer only as a plain hex colour", () => {
    const base = { id: "a", type: "poll", x: 0.5, y: 0.5, scale: 1, rotation: 0, look: 4, payload: { question: "Q?", options: ["a", "b"] } };
    expect(readLayers([{ ...base, tint: "#40220F" }])[0].tint).toBe("#40220f");
    expect(readLayers([{ ...base, tint: "red; background:url(x)" }])[0].tint).toBeUndefined();
  });
});
