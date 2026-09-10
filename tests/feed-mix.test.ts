import { describe, it, expect } from "vitest";
import {
  placeShots,
  spliceShots,
  placeAds,
  spliceFeed,
  PLACE_DEFAULTS,
  AD_DEFAULTS,
  SHOT_AD_OPTS,
  EMPTY_LANE,
  extendAdLane,
  type AdLane,
} from "@/lib/feed-mix";

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

/**
 * Ads are a second quota pass over the same index space as shots, so most of
 * what can go wrong is a collision between the two passes rather than anything
 * either one does alone. These cover the collision.
 */
describe("placeAds", () => {
  const shotSlots = (n: number) =>
    placeShots(posts(40), shots(n)).map((s) => s.slot);

  it("never puts an ad within `gap` of a shot, at any feed size", () => {
    // The exhaustive form on purpose: 5/8 against 3/6 collides at 11 and 19,
    // and which sizes expose that is not obvious by eye.
    for (let n = 0; n <= 40; n++) {
      for (let k = 0; k <= 3; k++) {
        const reserved = placeShots(posts(n), shots(k)).map((s) => s.slot);
        for (const ad of placeAds(n, reserved)) {
          for (const shot of reserved) {
            expect(Math.abs(ad.slot - shot)).toBeGreaterThanOrEqual(
              AD_DEFAULTS.gap
            );
          }
        }
      }
    }
  });

  it("never slots an ad at or past the end", () => {
    // The last card sits above "You're all caught up", where an ad reads as
    // Hypefy signing off rather than as an advert.
    for (let n = 0; n <= 40; n++) {
      for (const ad of placeAds(n, [])) expect(ad.slot).toBeLessThan(n);
    }
  });

  it("never puts an ad in the opening run of the feed", () => {
    expect(
      placeAds(40, []).every((a) => a.slot >= AD_DEFAULTS.firstSlot)
    ).toBe(true);
  });

  it("keeps ads at least `every` apart", () => {
    const slots = placeAds(40, []).map((a) => a.slot);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i] - slots[i - 1]).toBeGreaterThanOrEqual(AD_DEFAULTS.every);
    }
  });

  it("places nothing on a thin feed", () => {
    expect(placeAds(AD_DEFAULTS.minPosts - 1, [])).toEqual([]);
    expect(placeAds(0, [])).toEqual([]);
  });

  it("respects the max", () => {
    expect(placeAds(400, [])).toHaveLength(AD_DEFAULTS.max);
  });

  it("appends beyond startAfter without renumbering", () => {
    // Pagination: an ad the reader has already scrolled past must not move,
    // because moving it remounts the unit — a second request, a double-counted
    // impression, and a jump above the scroll position.
    const first = placeAds(20, []);
    const next = placeAds(40, [], {
      startAfter: first[first.length - 1].slot + AD_DEFAULTS.every,
      startIndex: first.length,
    });
    expect(next[0].slot).toBeGreaterThan(first[first.length - 1].slot);
    expect(next[0].index).toBe(first.length);
    expect(next.map((a) => a.id)).not.toContain(first[0].id);
  });

  it("gives up rather than drifting when shots saturate the region", () => {
    // Every slot blocked from firstSlot onwards: the ad has nowhere legal to
    // go, and walking it forward until it finds one would land it wherever,
    // not where the spacing rules say.
    const wall = Array.from({ length: 40 }, (_, i) => i);
    expect(placeAds(40, wall)).toEqual([]);
  });

  it("still places when there are no shots at all", () => {
    expect(placeAds(40, shotSlots(0)).length).toBeGreaterThan(0);
  });
});

describe("spliceFeed", () => {
  it("loses no posts, whatever is spliced in", () => {
    const p = posts(30);
    const placed = placeShots(p, shots(3));
    const ads = placeAds(p.length, placed.map((s) => s.slot));
    const out = spliceFeed(p, placed, ads);
    expect(out.filter((i) => i.kind === "post")).toHaveLength(30);
    expect(out.filter((i) => i.kind === "shot")).toHaveLength(placed.length);
    expect(out.filter((i) => i.kind === "ad")).toHaveLength(ads.length);
  });

  it("never yields two non-posts in a row", () => {
    // The whole point of the gap. Two interruptions back to back is the thing
    // a reader notices, whichever two they are.
    for (let n = 0; n <= 40; n++) {
      const p = posts(n);
      const placed = placeShots(p, shots(3));
      const ads = placeAds(n, placed.map((s) => s.slot));
      const out = spliceFeed(p, placed, ads);
      for (let i = 1; i < out.length; i++) {
        expect(out[i].kind !== "post" && out[i - 1].kind !== "post").toBe(false);
      }
    }
  });

  it("puts the shot before the ad when both land on one index", () => {
    // Should not happen via placeAds, but the order has to be stated rather
    // than fall out of Map insertion.
    const out = spliceFeed(posts(5), [{ id: "s0", slot: 2 }], [
      { id: "a0", slot: 2 },
    ]);
    expect(out.map((i) => i.kind)).toEqual([
      "post",
      "post",
      "shot",
      "ad",
      "post",
      "post",
      "post",
    ]);
  });

  it("drops an over-slotted ad rather than parking it at the bottom", () => {
    const out = spliceFeed(posts(2), [], [{ id: "a0", slot: 99 }]);
    expect(out.every((i) => i.kind === "post")).toBe(true);
  });
});

describe("extendAdLane", () => {
  const ext = (lane: AdLane, n: number, reserved: number[] = [], budget = 99) =>
    extendAdLane(lane, n, reserved, { budget });

  it("places the first page like placeAds does", () => {
    const lane = ext(EMPTY_LANE, 30);
    expect(lane.ads.map((a) => a.slot)).toEqual(
      placeAds(30, []).map((a) => a.slot)
    );
  });

  it("never places into content the reader already had", () => {
    // The bug this exists to prevent. 30 posts at 2 per pass leaves the
    // cursor at 21; the next page must not put an ad at 21, because the
    // reader is already past it — above them in the feed, behind them in
    // Shots, where it would replace the video on screen.
    const first = ext(EMPTY_LANE, 30);
    const second = ext(first, 50);
    const added = second.ads.slice(first.ads.length);
    expect(added.length).toBeGreaterThan(0);
    for (const ad of added) expect(ad.slot).toBeGreaterThanOrEqual(30);
  });

  it("does nothing when the count has not changed", () => {
    // StrictMode runs effects twice; an effect can re-run for unrelated
    // reasons. Neither may mint more ads.
    const lane = ext(EMPTY_LANE, 30);
    expect(ext(lane, 30)).toBe(lane);
  });

  it("keeps ids unique and indices continuous across pages", () => {
    let lane = EMPTY_LANE;
    for (const n of [20, 40, 60, 80]) lane = ext(lane, n);
    const ids = lane.ads.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(lane.ads.map((a) => a.index)).toEqual(ids.map((_, i) => i));
  });

  it("keeps the spacing across a page boundary", () => {
    let lane = EMPTY_LANE;
    for (const n of [20, 40, 60, 80]) lane = ext(lane, n);
    const slots = lane.ads.map((a) => a.slot);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i] - slots[i - 1]).toBeGreaterThanOrEqual(AD_DEFAULTS.every);
    }
  });

  it("places nothing once the session budget is spent", () => {
    expect(ext(EMPTY_LANE, 30, [], 0).ads).toEqual([]);
  });

  it("caps a pass at the remaining budget", () => {
    expect(
      extendAdLane(EMPTY_LANE, 80, [], { ...SHOT_AD_OPTS, budget: 1 }).ads
    ).toHaveLength(1);
  });

  it("spaces Shots ads wider than feed ads, and never at the start", () => {
    const lane = extendAdLane(EMPTY_LANE, 80, [], { ...SHOT_AD_OPTS, budget: 99 });
    expect(lane.ads[0].slot).toBe(SHOT_AD_OPTS.firstSlot);
    const slots = lane.ads.map((a) => a.slot);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i] - slots[i - 1]).toBeGreaterThanOrEqual(SHOT_AD_OPTS.every!);
    }
  });
});
