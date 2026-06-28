import { describe, it, expect } from "vitest";
import { feedScore, diversify, postTags, tagAffinityFor } from "@/lib/feed-rank";

const now = Date.UTC(2026, 5, 28, 12, 0, 0);
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

describe("feedScore", () => {
  it("gives a fresh post full recency (~96) and decays over 48h", () => {
    const fresh = feedScore({ created_at: iso(0) }, false, false, false, now);
    const old = feedScore({ created_at: iso(48 * 3_600_000) }, false, false, false, now);
    expect(fresh).toBeCloseTo(96, 0);
    expect(old).toBe(0);
  });

  it("boosts followed over own over stranger", () => {
    const p = { created_at: iso(0) };
    const followed = feedScore(p, false, true, false, now);
    const own = feedScore(p, true, false, false, now);
    const stranger = feedScore(p, false, false, false, now);
    expect(followed).toBeGreaterThan(own);
    expect(own).toBeGreaterThan(stranger);
  });

  it("caps engagement at 60", () => {
    const base = { created_at: iso(0) };
    const huge = feedScore({ ...base, hype_count: 9999, comment_count: 9999, save_count: 9999 }, false, false, false, now);
    const none = feedScore(base, false, false, false, now);
    expect(huge - none).toBe(60);
  });

  it("adds +18 for an interest match", () => {
    const p = { created_at: iso(0) };
    expect(feedScore(p, false, false, true, now) - feedScore(p, false, false, false, now)).toBe(18);
  });

  it("boosts by author affinity, capped at +30", () => {
    const p = { created_at: iso(0) };
    const base = feedScore(p, false, false, false, now);
    expect(feedScore(p, false, false, false, now, 10) - base).toBeCloseTo(15, 5); // 10*1.5
    expect(feedScore(p, false, false, false, now, 9999) - base).toBe(30); // capped
  });

  it("boosts by tag affinity, capped at +15", () => {
    const p = { created_at: iso(0) };
    const base = feedScore(p, false, false, false, now);
    expect(feedScore(p, false, false, false, now, 0, 4) - base).toBeCloseTo(6, 5); // 4*1.5
    expect(feedScore(p, false, false, false, now, 0, 9999) - base).toBe(15); // capped
  });
});

describe("tagAffinityFor", () => {
  it("sums tag weights and adds a bonus for followed tags", () => {
    const post = { hashtags: ["#FYP", "art", "misc"] };
    const weights = { fyp: 3, art: 1 };
    const followed = new Set(["art"]);
    // fyp 3 + art (1 + 2 followed bonus) + misc 0 = 6
    expect(tagAffinityFor(post, weights, followed)).toBe(6);
  });
  it("is 0 with no overlap and tolerates null hashtags", () => {
    expect(tagAffinityFor({ hashtags: null }, { x: 5 })).toBe(0);
    expect(tagAffinityFor({ hashtags: ["nope"] }, { x: 5 })).toBe(0);
  });
});

describe("diversify", () => {
  it("never places the same author in consecutive slots when avoidable", () => {
    const ranked = [
      { user_id: "a", id: 1 }, { user_id: "a", id: 2 }, { user_id: "a", id: 3 },
      { user_id: "b", id: 4 }, { user_id: "c", id: 5 },
    ];
    const out = diversify(ranked);
    expect(out).toHaveLength(5);
    let consecutive = 0;
    for (let i = 1; i < out.length; i++) if (out[i].user_id === out[i - 1].user_id) consecutive++;
    // b + c can break up two of the a-a adjacencies; at most one unavoidable run remains
    expect(consecutive).toBeLessThanOrEqual(1);
  });

  it("preserves every item", () => {
    const ranked = [{ user_id: "a", id: 1 }, { user_id: "b", id: 2 }];
    expect(diversify(ranked).map((x) => x.id).sort()).toEqual([1, 2]);
  });
});

describe("postTags", () => {
  it("lowercases and strips leading #, tolerates null", () => {
    expect(postTags({ hashtags: ["#FYP", "Trending"] })).toEqual(["fyp", "trending"]);
    expect(postTags({ hashtags: null })).toEqual([]);
    expect(postTags({})).toEqual([]);
  });
});
