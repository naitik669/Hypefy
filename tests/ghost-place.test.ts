import { describe, it, expect } from "vitest";
import { placeGhost } from "@/lib/ghost-place";

/**
 * Ghost Share, receiving: one item lifted into the first three, nothing else
 * moved, and nothing about it that tells it apart.
 */

const feed = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, caption: `c${i}` }));

describe("placeGhost", () => {
  it("leaves the feed alone when there is nothing to place", () => {
    const f = feed(5);
    expect(placeGhost(f, null)).toBe(f);
    expect(placeGhost(f, undefined)).toBe(f);
  });

  it("leaves the feed alone when the item is already in the first three", () => {
    const f = feed(6);
    for (const at of [0, 1, 2]) expect(placeGhost(f, f[at])).toBe(f);
  });

  it("moves an item from further down into the first three, without a second copy", () => {
    const f = feed(8);
    const out = placeGhost(f, f[6]);
    const at = out.findIndex((x) => x.id === "s6");
    expect([0, 1, 2]).toContain(at);
    expect(out).toHaveLength(8);
    expect(out.filter((x) => x.id === "s6")).toHaveLength(1);
  });

  it("adds an item the feed did not have, in the first three", () => {
    const out = placeGhost(feed(8), { id: "new", caption: "x" });
    expect([0, 1, 2]).toContain(out.findIndex((x) => x.id === "new"));
    expect(out).toHaveLength(9);
  });

  it("is never lower than third, whatever the id", () => {
    for (let i = 0; i < 60; i++) {
      const g = { id: `ghost-${i}`, caption: "x" };
      expect(placeGhost(feed(8), g).findIndex((x) => x.id === g.id)).toBeLessThan(3);
    }
  });

  it("uses all three places across ids, about evenly, and the same place for the same id", () => {
    const count = [0, 0, 0];
    for (let i = 0; i < 300; i++) {
      const g = { id: `00000000-0000-4000-8000-${String(i * 7919).padStart(12, "0")}`, caption: "x" };
      count[placeGhost(feed(8), g).findIndex((x) => x.id === g.id)]++;
    }
    for (const n of count) expect(n).toBeGreaterThan(60);
  });

  it("keeps the same place for the same id", () => {
    const slots = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const g = { id: `ghost-${i}`, caption: "x" };
      const a = placeGhost(feed(8), g).findIndex((x) => x.id === g.id);
      const b = placeGhost(feed(8), g).findIndex((x) => x.id === g.id);
      expect(a).toBe(b);
      slots.add(a);
    }
    expect([...slots].sort()).toEqual([0, 1, 2]);
  });

  it("keeps everything else in the order it was in", () => {
    const f = feed(8);
    const out = placeGhost(f, f[5]);
    expect(out.filter((x) => x.id !== "s5").map((x) => x.id)).toEqual(f.filter((x) => x.id !== "s5").map((x) => x.id));
  });

  it("copes with feeds too short to have a second or third place", () => {
    const g = { id: "g", caption: "x" };
    expect(placeGhost([], g).map((x) => x.id)).toEqual(["g"]);
    expect(placeGhost(feed(1), g)).toHaveLength(2);
    expect(placeGhost(feed(2), { id: "gg", caption: "x" })).toHaveLength(3);
  });

  it("returns the feed's own copy, and adds no field to it", () => {
    const f = feed(8);
    const out = placeGhost(f, { id: "s6", caption: "a different object" });
    const placed = out.find((x) => x.id === "s6")!;
    expect(placed).toBe(f[6]);
    expect(Object.keys(placed).sort()).toEqual(Object.keys(f[0]).sort());
    expect(f.map((x) => x.id)).toEqual(feed(8).map((x) => x.id));
  });
});
