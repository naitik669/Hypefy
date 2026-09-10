import { describe, it, expect } from "vitest";
import { distribute, clampRatio, pinHeight } from "@/lib/masonry";

const h = (x: { h: number }) => x.h;
const items = (hs: number[]) => hs.map((height, i) => ({ id: i, h: height }));

describe("distribute", () => {
  it("puts each item in the shortest column", () => {
    const cols = distribute(items([2, 1, 1, 1]), 2, h);
    // 0 → left (tie, leftmost), 1 → right, 2 → right (1 < 2), 3 → left/right tie at 2 → left
    expect(cols.map((c) => c.map((x) => x.id))).toEqual([[0, 3], [1, 2]]);
  });

  it("never moves an item already placed when more arrive", () => {
    // The reason this is not CSS columns: appending a page must not reshuffle
    // what is on screen.
    const first = items([1.4, 0.8, 1.1, 0.6, 1.3, 0.9]);
    const more = [...first, ...items([0.7, 1.5, 1.0, 0.8]).map((x) => ({ ...x, id: x.id + 100 }))];
    const before = distribute(first, 2, h).map((c) => c.map((x) => x.id));
    const after = distribute(more, 2, h).map((c) => c.map((x) => x.id));
    for (let c = 0; c < 2; c++) {
      expect(after[c].slice(0, before[c].length)).toEqual(before[c]);
    }
  });

  it("keeps two columns roughly level", () => {
    const hs = Array.from({ length: 60 }, (_, i) => 0.6 + ((i * 37) % 11) / 10);
    const cols = distribute(items(hs), 2, h);
    const [a, b] = cols.map((c) => c.reduce((s, x) => s + x.h, 0));
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1.8);
  });

  it("loses nothing and duplicates nothing", () => {
    const list = items([1, 2, 3, 1, 2, 3, 1]);
    const flat = distribute(list, 3, h).flat().map((x) => x.id).sort();
    expect(flat).toEqual(list.map((x) => x.id).sort());
  });

  it("copes with no items and with a silly column count", () => {
    expect(distribute([], 2, h)).toEqual([[], []]);
    expect(distribute(items([1]), 0, h)).toEqual([[{ id: 0, h: 1 }]]);
  });
});

describe("clampRatio", () => {
  it("falls back to square without a usable ratio", () => {
    expect(clampRatio(null)).toBe(1);
    expect(clampRatio(0)).toBe(1);
    expect(clampRatio(NaN)).toBe(1);
  });
  it("clamps to 9:16..16:9", () => {
    expect(clampRatio(0.2)).toBeCloseTo(9 / 16);
    expect(clampRatio(5)).toBeCloseTo(16 / 9);
    expect(clampRatio(0.8)).toBe(0.8);
  });
});

describe("pinHeight", () => {
  it("is taller for a portrait image than a landscape one", () => {
    const portrait = pinHeight({ aspect_ratio: 0.75, hasImage: true, hasCaption: false });
    const landscape = pinHeight({ aspect_ratio: 1.6, hasImage: true, hasCaption: false });
    expect(portrait).toBeGreaterThan(landscape);
  });
  it("allows for a caption", () => {
    const a = pinHeight({ aspect_ratio: 1, hasImage: true, hasCaption: false });
    const b = pinHeight({ aspect_ratio: 1, hasImage: true, hasCaption: true });
    expect(b).toBeGreaterThan(a);
  });
});
