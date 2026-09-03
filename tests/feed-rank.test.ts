import { describe, it, expect } from "vitest";
import {
  feedScore,
  diversify,
  postTags,
  tagAffinityFor,
  refreshJitter,
  refreshSeed,
} from "@/lib/feed-rank";

const now = Date.UTC(2026, 5, 28, 12, 0, 0);
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

describe("feedScore", () => {
  it("gives a fresh post full recency (~96) and decays over 48h", () => {
    const fresh = feedScore({ created_at: iso(0) }, false, false, false, now);
    const old = feedScore(
      { created_at: iso(48 * 3_600_000) },
      false,
      false,
      false,
      now
    );
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
    const huge = feedScore(
      { ...base, hype_count: 9999, comment_count: 9999, save_count: 9999 },
      false,
      false,
      false,
      now
    );
    const none = feedScore(base, false, false, false, now);
    expect(huge - none).toBe(60);
  });

  it("adds +18 for an interest match", () => {
    const p = { created_at: iso(0) };
    expect(
      feedScore(p, false, false, true, now) -
        feedScore(p, false, false, false, now)
    ).toBe(18);
  });

  it("boosts by author affinity, capped at +30", () => {
    const p = { created_at: iso(0) };
    const base = feedScore(p, false, false, false, now);
    expect(feedScore(p, false, false, false, now, 10) - base).toBeCloseTo(
      15,
      5
    ); // 10*1.5
    expect(feedScore(p, false, false, false, now, 9999) - base).toBe(30); // capped
  });

  it("boosts by tag affinity, capped at +15", () => {
    const p = { created_at: iso(0) };
    const base = feedScore(p, false, false, false, now);
    expect(feedScore(p, false, false, false, now, 0, 4) - base).toBeCloseTo(
      6,
      5
    ); // 4*1.5
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
      { user_id: "a", id: 1 },
      { user_id: "a", id: 2 },
      { user_id: "a", id: 3 },
      { user_id: "b", id: 4 },
      { user_id: "c", id: 5 },
    ];
    const out = diversify(ranked);
    expect(out).toHaveLength(5);
    let consecutive = 0;
    for (let i = 1; i < out.length; i++)
      if (out[i].user_id === out[i - 1].user_id) consecutive++;
    // b + c can break up two of the a-a adjacencies; at most one unavoidable run remains
    expect(consecutive).toBeLessThanOrEqual(1);
  });

  it("preserves every item", () => {
    const ranked = [
      { user_id: "a", id: 1 },
      { user_id: "b", id: 2 },
    ];
    expect(
      diversify(ranked)
        .map((x) => x.id)
        .sort()
    ).toEqual([1, 2]);
  });
});

describe("postTags", () => {
  it("lowercases and strips leading #, tolerates null", () => {
    expect(postTags({ hashtags: ["#FYP", "Trending"] })).toEqual([
      "fyp",
      "trending",
    ]);
    expect(postTags({ hashtags: null })).toEqual([]);
    expect(postTags({})).toEqual([]);
  });
});

describe("already-interacted demotion", () => {
  it("demotes an interacted post below an identical untouched one", () => {
    const p = { created_at: iso(0) };
    const seen = feedScore(p, false, false, false, now, 0, 0, true);
    const unseen = feedScore(p, false, false, false, now, 0, 0, false);
    expect(seen).toBeLessThan(unseen);
    expect(unseen - seen).toBe(55);
  });

  it("demotes rather than buries — a followed friend's seen post still beats a stale stranger", () => {
    // The whole reason this is a penalty and not a filter: the heaviest
    // account has interacted with nearly every post, so hiding them would
    // leave almost no feed.
    const seenFriend = feedScore(
      { created_at: iso(0) },
      false,
      true,
      false,
      now,
      0,
      0,
      true
    );
    const staleStranger = feedScore(
      { created_at: iso(40 * 3_600_000) },
      false,
      false,
      false,
      now
    );
    expect(seenFriend).toBeGreaterThan(staleStranger);
  });

  it("defaults to no penalty so existing callers are unaffected", () => {
    const p = { created_at: iso(0) };
    expect(feedScore(p, false, false, false, now)).toBe(
      feedScore(p, false, false, false, now, 0, 0, false)
    );
  });
});

describe("already-seen demotion", () => {
  const base = {
    created_at: iso(0),
    hype_count: 0,
    comment_count: 0,
    save_count: 0,
  };

  it("demotes a seen post below an unseen one", () => {
    const unseen = feedScore(
      base,
      false,
      false,
      false,
      now,
      0,
      0,
      false,
      false
    );
    const seen = feedScore(base, false, false, false, now, 0, 0, false, true);
    expect(seen).toBeLessThan(unseen);
    expect(unseen - seen).toBe(25);
  });

  it("penalises seeing less than interacting — a glance is not a statement", () => {
    const seen = feedScore(base, false, false, false, now, 0, 0, false, true);
    const hyped = feedScore(base, false, false, false, now, 0, 0, true, false);
    expect(hyped).toBeLessThan(seen);
  });

  it("does not stack the two penalties", () => {
    const both = feedScore(base, false, false, false, now, 0, 0, true, true);
    const onlyInteracted = feedScore(
      base,
      false,
      false,
      false,
      now,
      0,
      0,
      true,
      false
    );
    expect(both).toBe(onlyInteracted);
  });

  it("defaults to no penalty so existing callers are unaffected", () => {
    expect(feedScore(base, false, false, false, now, 0, 0, false)).toBe(
      feedScore(base, false, false, false, now, 0, 0, false, false)
    );
  });
});

describe("refresh variety", () => {
  it("is stable within a seed and changes across seeds", () => {
    const a = refreshJitter("post-1", 100);
    expect(refreshJitter("post-1", 100)).toBe(a);
    expect(refreshJitter("post-1", 101)).not.toBe(a);
  });

  it("differs between posts under the same seed, so ties break apart", () => {
    expect(refreshJitter("post-1", 100)).not.toBe(refreshJitter("post-2", 100));
  });

  it("stays within its amplitude so it cannot outrank recency", () => {
    for (const id of ["a", "b", "post-xyz", "9f2c", "zzzz"]) {
      const j = refreshJitter(id, 7);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThan(20);
    }
  });

  it("draws a different seed per call, so two refreshes differ", () => {
    // The regression this replaces: refreshSeed used to bucket by wall clock
    // (now / 3 minutes), so every refresh inside that window returned the
    // same seed and therefore a byte-identical feed.
    const seeds = new Set(Array.from({ length: 50 }, () => refreshSeed()));
    expect(seeds.size).toBeGreaterThan(45);
  });

  it("still orders one render consistently once a seed is drawn", () => {
    // Randomness per render is fine; randomness per comparison is not.
    const seed = refreshSeed();
    expect(refreshJitter("post-1", seed)).toBe(refreshJitter("post-1", seed));
  });
});
