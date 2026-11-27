import { describe, it, expect } from "vitest";
import {
  WEIGHTS,
  countSharedHypes,
  isSuspended,
  pagesOf,
  rankPeople,
  reasonFor,
  type PeopleCandidate,
  type PeopleSignals,
} from "@hypefy/core/people-rank";

/**
 * The People page's ranking, driven with plain rows.
 *
 * The shapes here are the real network's on 26 Nov 2026, cut down: the
 * person the old get_suggested_people left out (Chuglimaxxer, who shares nine
 * hyped posts with Naitik and has no mutual and does not follow him) is the
 * case this module exists for.
 */

const NOW = Date.parse("2026-11-27T09:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function person(id: string, extra: Partial<PeopleCandidate> = {}): PeopleCandidate {
  return {
    id,
    display_name: id[0].toUpperCase() + id.slice(1),
    username: id,
    avatar_hue: 200,
    avatar_url: null,
    accent_id: null,
    is_verified: false,
    created_at: daysAgo(120),
    last_seen_at: null,
    profile_completed: true,
    suspended_at: null,
    suspended_until: null,
    ...extra,
  };
}

function signals(extra: Partial<PeopleSignals> = {}): PeopleSignals {
  return {
    me: "me",
    following: new Set(),
    requested: new Set(),
    followers: new Set(),
    blocked: new Set(),
    followsOfFollowing: [],
    sharedHypes: new Map(),
    followerCounts: new Map(),
    faces: new Map(),
    now: NOW,
    ...extra,
  };
}

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("who may be suggested at all", () => {
  const all = [
    person("me"),
    person("friend"),
    person("asked"),
    person("blocked"),
    person("unfinished", { profile_completed: false }),
    person("banned", { suspended_at: daysAgo(3), suspended_until: null }),
    person("benched", { suspended_at: daysAgo(3), suspended_until: daysAgo(-2) }),
    person("served", { suspended_at: daysAgo(30), suspended_until: daysAgo(1) }),
    person("stranger"),
  ];
  const out = rankPeople(
    all,
    signals({
      following: new Set(["friend"]),
      requested: new Set(["asked"]),
      blocked: new Set(["blocked"]),
    })
  );

  it("never you, anyone you follow, anyone you asked to, anyone blocked either way", () => {
    for (const id of ["me", "friend", "asked", "blocked"]) expect(ids(out)).not.toContain(id);
  });

  it("never an unfinished profile or a running suspension", () => {
    for (const id of ["unfinished", "banned", "benched"]) expect(ids(out)).not.toContain(id);
  });

  it("but a suspension that has ended no longer hides them, and nobody is dropped for having no signal", () => {
    expect(ids(out).sort()).toEqual(["served", "stranger"]);
  });

  it("each person once, even if the rows repeat them", () => {
    expect(ids(rankPeople([person("a"), person("a")], signals()))).toEqual(["a"]);
  });
});

describe("isSuspended", () => {
  it("is false with no suspension, true with no end, and ends when the end passes", () => {
    expect(isSuspended(person("x"), NOW)).toBe(false);
    expect(isSuspended(person("x", { suspended_at: daysAgo(1) }), NOW)).toBe(true);
    expect(isSuspended(person("x", { suspended_at: daysAgo(2), suspended_until: daysAgo(-1) }), NOW)).toBe(true);
    expect(isSuspended(person("x", { suspended_at: daysAgo(2), suspended_until: daysAgo(1) }), NOW)).toBe(false);
  });
});

describe("the order", () => {
  it("someone who hypes what you hype outranks a stranger: the case the old RPC missed", () => {
    const out = rankPeople(
      [person("stranger"), person("chugli")],
      signals({ sharedHypes: new Map([["chugli", 9]]) })
    );
    expect(ids(out)).toEqual(["chugli", "stranger"]);
    expect(out[0].reason).toBe("Hypes what you hype");
    expect(out[0].score).toBeCloseTo(Math.log2(10) * WEIGHTS.sharedHypes);
  });

  it("each signal adds exactly its weight", () => {
    const base = signals({
      following: new Set(["f1", "f2"]),
      followsOfFollowing: [
        { follower_id: "f1", following_id: "m" },
        { follower_id: "f2", following_id: "m" },
      ],
      followers: new Set(["back"]),
    });
    const out = rankPeople(
      [person("m"), person("back"), person("active", { last_seen_at: daysAgo(2) }), person("stale", { last_seen_at: daysAgo(9) })],
      base
    );
    const score = Object.fromEntries(out.map((p) => [p.id, p.score]));
    expect(score.m).toBe(2 * WEIGHTS.mutual);
    expect(score.back).toBe(WEIGHTS.followsYou);
    expect(score.active).toBe(WEIGHTS.activeThisWeek);
    expect(score.stale).toBe(0);
  });

  it("shared hypes grow by doubling, so a heavy hyper cannot drown out four mutuals", () => {
    const four = ["f1", "f2", "f3", "f4"];
    const out = rankPeople(
      [person("hyper"), person("mutual")],
      signals({
        following: new Set(four),
        followsOfFollowing: four.map((f) => ({ follower_id: f, following_id: "mutual" })),
        sharedHypes: new Map([["hyper", 30]]),
      })
    );
    // Thirty shared hypes counted one by one would be 60 against 12.
    expect(ids(out)).toEqual(["mutual", "hyper"]);
    expect(out[1].score).toBeCloseTo(Math.log2(31) * WEIGHTS.sharedHypes);
  });

  it("ties go to the better followed, then by id, so the order never wobbles", () => {
    const out = rankPeople(
      [person("b"), person("c"), person("a")],
      signals({ followerCounts: new Map([["c", 4]]) })
    );
    expect(ids(out)).toEqual(["c", "a", "b"]);
  });

  it("a follows row from someone you do not follow is not a mutual", () => {
    const out = rankPeople(
      [person("x")],
      signals({ followsOfFollowing: [{ follower_id: "nobody-i-follow", following_id: "x" }] })
    );
    expect(out[0].mutuals).toEqual([]);
    expect(out[0].score).toBe(0);
  });
});

describe("the faces under the name", () => {
  it("are the people you follow who follow them, at most three, in that order", () => {
    const face = (id: string) => ({ id, name: id, avatar_hue: 1, avatar_url: null });
    const out = rankPeople(
      [person("x")],
      signals({
        following: new Set(["a", "b", "c", "d"]),
        followsOfFollowing: ["a", "b", "c", "d"].map((f) => ({ follower_id: f, following_id: "x" })),
        faces: new Map(["a", "b", "c", "d"].map((id) => [id, face(id)])),
      })
    );
    expect(out[0].reason).toBe("4 mutuals");
    expect(ids(out[0].mutuals)).toEqual(["a", "b", "c"]);
  });
});

describe("the line under the name", () => {
  const none = { mutuals: 0, followsYou: false, sharedHypes: 0, followers: 0, joinedDaysAgo: 200 };
  it("strongest true reason first", () => {
    expect(reasonFor({ ...none, mutuals: 1, followsYou: true, sharedHypes: 3 })).toBe("1 mutual");
    expect(reasonFor({ ...none, mutuals: 3 })).toBe("3 mutuals");
    expect(reasonFor({ ...none, followsYou: true, sharedHypes: 3 })).toBe("Follows you");
    expect(reasonFor({ ...none, sharedHypes: 1, joinedDaysAgo: 1 })).toBe("Hypes what you hype");
    expect(reasonFor({ ...none, joinedDaysAgo: 14, followers: 5 })).toBe("New to Hypefy");
    expect(reasonFor({ ...none, joinedDaysAgo: 15, followers: 1 })).toBe("1 follower");
    expect(reasonFor({ ...none, followers: 4 })).toBe("4 followers");
    expect(reasonFor(none)).toBe("Say hi first");
    expect(reasonFor({ ...none, joinedDaysAgo: null })).toBe("Say hi first");
  });
});

describe("countSharedHypes", () => {
  it("counts distinct shared targets per person, by type as well as id, never me", () => {
    const mine = [
      { target_type: "post", target_id: "p1" },
      { target_type: "post", target_id: "p2" },
      { target_type: "shot", target_id: "s1" },
    ];
    const theirs = [
      { user_id: "a", target_type: "post", target_id: "p1" },
      { user_id: "a", target_type: "post", target_id: "p1" },
      { user_id: "a", target_type: "shot", target_id: "s1" },
      { user_id: "b", target_type: "shot", target_id: "p1" },
      { user_id: "b", target_type: "post", target_id: "p9" },
      { user_id: "me", target_type: "post", target_id: "p2" },
    ];
    const out = countSharedHypes("me", mine, theirs);
    expect(Object.fromEntries(out)).toEqual({ a: 2 });
  });
});

describe("pagesOf", () => {
  it("cuts into pages of four, the last one short", () => {
    expect(pagesOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).map((p) => p.length)).toEqual([4, 4, 3]);
    expect(pagesOf([1, 2, 3], 8)).toEqual([[1, 2, 3]]);
    expect(pagesOf([])).toEqual([]);
  });
  it("refuses a page size that would loop forever", () => {
    expect(() => pagesOf([1], 0)).toThrow();
  });
});

describe("the tile's colour", () => {
  it("is the person's own accent, and lime when they never picked one", () => {
    const out = rankPeople([person("v", { accent_id: "violet" }), person("n")], signals());
    const byId = Object.fromEntries(out.map((p) => [p.id, p.accent]));
    expect(byId.v).toBe("#c4b5fd");
    expect(byId.n).toBe("#a3e635");
  });
});
