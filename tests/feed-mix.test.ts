import { describe, it, expect } from "vitest";
import { placeShots, spliceShots, PLACE_DEFAULTS } from "@/lib/feed-mix";

const posts = (n: number, author = (i: number) => `u${i}`) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, user_id: author(i) }));
const shots = (n: number, author = (i: number) => `s${i}`) =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, user_id: author(i) }));

/**
 * Placement is quota-driven rather than score-driven, so these rules ARE the
 * behaviour — there is no scoring to fall back on if they are wrong.
 */
describe("placeShots", () => {
  it("never puts a shot in the first slot", () => {
    // A shot at index 0 reads as an advert for the Shots tab rather than as
    // the feed opening.
    const placed = placeShots(posts(30), shots(3));
    expect(placed.every((s) => s.slot >= PLACE_DEFAULTS.firstSlot)).toBe(true);
  });

  it("keeps shots at least `every` posts apart", () => {
    const placed = placeShots(posts(30), shots(3));
    const slots = placed.map((s) => s.slot).sort((a, b) => a - b);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i] - slots[i - 1]).toBeGreaterThanOrEqual(
        PLACE_DEFAULTS.every
      );
    }
  });

  it("respects the max", () => {
    expect(placeShots(posts(80), shots(20))).toHaveLength(PLACE_DEFAULTS.max);
  });

  it("thins out on a short feed rather than flooding it", () => {
    // 3 shots among 5 posts is 40% video — a different product, not a mixed
    // feed. The density floor is what stops that.
    expect(placeShots(posts(5), shots(3))).toHaveLength(1);
    expect(placeShots(posts(16), shots(3))).toHaveLength(2);
  });

  it("places nothing when there are barely any posts", () => {
    // Below firstSlot the feed is an empty state with a call to action, and a
    // lone shot floating above it is noise.
    expect(placeShots(posts(2), shots(3))).toEqual([]);
    expect(placeShots([], shots(3))).toEqual([]);
  });

  it("places nothing when there are no shots", () => {
    expect(placeShots(posts(30), [])).toEqual([]);
  });

  it("avoids putting a shot straight after that author's own post", () => {
    // diversify() ran over the posts before shots existed, so splicing can
    // reintroduce the adjacency it just removed.
    const p = posts(30, (i) => (i === 2 ? "same" : `u${i}`));
    const placed = placeShots(p, shots(1, () => "same"));
    expect(placed[0].slot).toBe(PLACE_DEFAULTS.firstSlot + 1);
  });

  it("takes shots in the order given — the caller has already ranked them", () => {
    const placed = placeShots(posts(30), shots(3));
    expect(placed.map((s) => s.id)).toEqual(["s0", "s1", "s2"]);
  });
});

describe("spliceShots", () => {
  it("returns posts untouched when there is nothing to splice", () => {
    const out = spliceShots(posts(3), []);
    expect(out).toHaveLength(3);
    expect(out.every((i) => i.kind === "post")).toBe(true);
  });

  it("puts a shot before the post at its slot", () => {
    const out = spliceShots(posts(5), [{ id: "s0", slot: 2 }]);
    expect(out.map((i) => (i.kind === "post" ? i.post.id : i.shot.id))).toEqual(
      ["p0", "p1", "s0", "p2", "p3", "p4"]
    );
  });

  it("loses nothing — every post and every shot comes out", () => {
    const p = posts(30);
    const placed = placeShots(p, shots(3));
    const out = spliceShots(p, placed);
    expect(out.filter((i) => i.kind === "post")).toHaveLength(30);
    expect(out.filter((i) => i.kind === "shot")).toHaveLength(placed.length);
  });

  it("appends a shot slotted past the end rather than dropping it", () => {
    const out = spliceShots(posts(2), [{ id: "s0", slot: 99 }]);
    expect(out[out.length - 1]).toEqual({
      kind: "shot",
      shot: { id: "s0", slot: 99 },
    });
  });

  it("never yields two shots in a row for a real placement", () => {
    const p = posts(30);
    const out = spliceShots(p, placeShots(p, shots(3)));
    for (let i = 1; i < out.length; i++) {
      expect(out[i].kind === "shot" && out[i - 1].kind === "shot").toBe(false);
    }
  });
});
