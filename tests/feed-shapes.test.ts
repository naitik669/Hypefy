import { describe, it, expect } from "vitest";
import { feedRatio } from "@/lib/aspect";
import { reshuffle } from "@/lib/discover-mix";

describe("feedRatio", () => {
  it("leaves a shape the feed already draws alone", () => {
    expect(feedRatio(1)).toBe(1);
    expect(feedRatio(4 / 5)).toBeCloseTo(0.8);
    expect(feedRatio(16 / 9)).toBeCloseTo(16 / 9);
  });

  it("stops a tall screenshot from taking the whole screen", () => {
    // 0.4 is the tallest a post can be stored at — two and a half screens.
    expect(feedRatio(0.4)).toBeCloseTo(0.8);
    expect(feedRatio(0.5625)).toBeCloseTo(0.8);
  });

  it("stops a panorama from becoming a strip", () => {
    expect(feedRatio(3)).toBeCloseTo(1.91);
  });

  it("falls back to a square when the shape is unknown", () => {
    expect(feedRatio(null)).toBe(1);
    expect(feedRatio(undefined)).toBe(1);
    expect(feedRatio(0)).toBe(1);
    expect(feedRatio(Number.NaN)).toBe(1);
  });
});

describe("reshuffle", () => {
  const list = Array.from({ length: 40 }, (_, i) => i);

  it("leaves the first load in the server's order", () => {
    expect(reshuffle(list, 0)).toEqual(list);
  });

  it("keeps every post, exactly once", () => {
    expect([...reshuffle(list, 3)].sort((a, b) => a - b)).toEqual(list);
  });

  it("gives the same order for the same refresh", () => {
    expect(reshuffle(list, 2)).toEqual(reshuffle(list, 2));
  });

  it("actually turns the feed over", () => {
    expect(reshuffle(list, 1)).not.toEqual(list);
    expect(reshuffle(list, 1)).not.toEqual(reshuffle(list, 2));
  });

  it("keeps the best posts near the top rather than scattering them", () => {
    // Shuffling happens inside bands, so the top 12 are still the top 12.
    const top = reshuffle(list, 5).slice(0, 12).sort((a, b) => a - b);
    expect(top).toEqual(list.slice(0, 12));
  });

  it("handles a short feed without losing anything", () => {
    expect([...reshuffle([1, 2, 3], 4)].sort()).toEqual([1, 2, 3]);
    expect(reshuffle([], 4)).toEqual([]);
  });
});
