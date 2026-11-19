import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  discoverScore,
  INTEREST_BOOST,
  AFFINITY_WEIGHT,
  AUTHOR_CAP,
  TAG_CAP,
  baseScore,
} from "../packages/core/src/discover-rank";
import { DESTINATIONS } from "../packages/core/src/navigation";
import {
  interestsOf,
  rankDiscover,
  normaliseDiscoverPost,
  POST_LIMIT,
  TAG_LIMIT,
  PEOPLE_LIMIT,
  NEW_PEOPLE,
  type DiscoverPost,
} from "../apps/mobile/src/discover/load";

/**
 * Discover on the phone.
 *
 * The ranking is the website's, so what is tested is that it IS the
 * website's — the caps especially, because a forgotten cap turns Discover
 * into "more of whoever you clicked last" and looks like nothing at all.
 */

const WEB = "src/app/(app)/discover/page.tsx";
const LOAD = "apps/mobile/src/discover/load.ts";
const SCREEN = "apps/mobile/app/(tabs)/discover.tsx";
const TOPBAR = "apps/mobile/src/TopBar.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function body(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .split("\n")
    .filter((line) => !/^\s*import\b/.test(line))
    .join("\n");
}

function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const NOW = Date.parse("2026-11-19T12:00:00.000Z");
const post = (over: Partial<DiscoverPost> & { id: string; user_id: string }): DiscoverPost => ({
  caption: null,
  image_url: "https://example.test/a.jpg",
  image_urls: null,
  hashtags: null,
  hype_count: 0,
  comment_count: 0,
  save_count: 0,
  share_count: 0,
  created_at: "2026-11-19T11:00:00.000Z",
  profiles: null,
  ...over,
});

const EMPTY = {
  now: NOW,
  interests: new Set<string>(),
  authorAffinity: {},
  tagAffinity: {},
  followedTags: new Set<string>(),
};

describe("the ranking is the website's ranking", () => {
  it("the web imports it rather than keeping its own", () => {
    const web = code(WEB);
    expect(web).toMatch(/discoverScore\(x, \{/);
    expect(web, "the web computes the boosts for itself again").not.toMatch(
      /interests\.size > 0 && tags\.some/,
    );
    expect(body(LOAD)).toMatch(/discoverScore\(p, ctx\)/);
  });

  it("an interest match is worth the web's own boost", () => {
    const plain = discoverScore(post({ id: "a", user_id: "u", hashtags: ["art"] }), EMPTY);
    const matched = discoverScore(post({ id: "a", user_id: "u", hashtags: ["art"] }), {
      ...EMPTY,
      interests: new Set(["art"]),
    });
    expect(matched - plain).toBeCloseTo(INTEREST_BOOST, 6);
    expect(INTEREST_BOOST).toBe(12);
  });

  it("author affinity is capped, so one author cannot own Discover", () => {
    /*
     * The cap is the point. Uncapped, a weight of 40 would add 60 — more
     * than the engagement ceiling — and Discover becomes a feed of
     * whoever you last interacted with.
     */
    const of = (weight: number) =>
      discoverScore(post({ id: "a", user_id: "u" }), { ...EMPTY, authorAffinity: { u: weight } });
    const plain = discoverScore(post({ id: "a", user_id: "u" }), EMPTY);
    expect(of(2) - plain).toBeCloseTo(2 * AFFINITY_WEIGHT, 6);
    expect(of(1000) - plain).toBeCloseTo(AUTHOR_CAP, 6);
    expect(AUTHOR_CAP).toBe(30);
  });

  it("tag affinity is capped too, and lower", () => {
    const of = (weight: number) =>
      discoverScore(post({ id: "a", user_id: "u", hashtags: ["art"] }), {
        ...EMPTY,
        tagAffinity: { art: weight },
      });
    const plain = discoverScore(post({ id: "a", user_id: "u", hashtags: ["art"] }), EMPTY);
    expect(of(1000) - plain).toBeCloseTo(TAG_CAP, 6);
    expect(TAG_CAP).toBe(15);
    expect(TAG_CAP).toBeLessThan(AUTHOR_CAP);
  });

  it("a negative affinity weight never subtracts", () => {
    // get_affinity can report a negative; it should not push a post below
    // one nobody has any relationship with.
    const plain = discoverScore(post({ id: "a", user_id: "u" }), EMPTY);
    const negative = discoverScore(post({ id: "a", user_id: "u" }), {
      ...EMPTY,
      authorAffinity: { u: -50 },
    });
    expect(negative).toBeCloseTo(plain, 6);
  });

  it("and engagement still decays with age, as baseScore decides", () => {
    /*
     * The web's note: this used to add the raw counts, so a Shot from
     * June with eight hypes scored 44 against 5 for one posted yesterday,
     * and every new Shot sat at the bottom of Discover.
     */
    const fresh = post({
      id: "a",
      user_id: "u",
      hype_count: 8,
      created_at: "2026-11-19T11:00:00.000Z",
    });
    const old = post({
      id: "b",
      user_id: "u",
      hype_count: 8,
      created_at: "2026-06-01T00:00:00.000Z",
    });
    expect(discoverScore(fresh, EMPTY)).toBeGreaterThan(discoverScore(old, EMPTY));
    expect(discoverScore(fresh, EMPTY)).toBeCloseTo(baseScore(fresh, NOW), 6);
  });
});

describe("the pool is filtered and spread the way the web's is", () => {
  it("a blocked author's posts are dropped", () => {
    const out = rankDiscover(
      [post({ id: "a", user_id: "blocked" }), post({ id: "b", user_id: "ok" })],
      { ...EMPTY, blocked: new Set(["blocked"]) },
    );
    expect(out.map((p) => p.id)).toEqual(["b"]);
  });

  it("one author does not take two slots in a row when it can be avoided", () => {
    /*
     * The web's reason, verbatim in its own comment: without diversify
     * one person who posted four things yesterday owns the top four slots
     * of Discover, which is not discovery.
     */
    const rows = [
      post({ id: "a1", user_id: "a", hype_count: 100 }),
      post({ id: "a2", user_id: "a", hype_count: 99 }),
      post({ id: "b1", user_id: "b", hype_count: 10 }),
    ];
    const out = rankDiscover(rows, { ...EMPTY, blocked: new Set() });
    expect(out.map((p) => p.user_id)).toEqual(["a", "b", "a"]);
    expect(out.length, "diversify dropped a post").toBe(3);
  });

  it("and the screen leaves out the reader's own posts", () => {
    expect(code(WEB)).toMatch(/\.neq\("user_id", user\.id\)/);
    expect(body(LOAD)).toMatch(/\.neq\("user_id", userId\)/);
  });
});

describe("the queries are the website's queries", () => {
  it("the same windows and limits", () => {
    const web = code(WEB);
    expect(POST_LIMIT).toBe(150);
    expect(web).toMatch(/\.limit\(150\)/);
    expect(TAG_LIMIT).toBe(16);
    expect(web).toMatch(/p_limit: 16/);
    expect(PEOPLE_LIMIT).toBe(12);
    expect(web).toMatch(/p_limit: 12/);
    expect(NEW_PEOPLE).toBe(8);
    expect(web).toMatch(/\.limit\(8\)/);
  });

  it("the same RPCs, by name", () => {
    const web = code(WEB);
    const src = body(LOAD);
    for (const rpc of ["get_affinity", "get_trending_tags", "get_suggested_people"]) {
      expect(web, `the web no longer calls ${rpc}`).toContain(rpc);
      expect(src, `the phone does not call ${rpc}`).toContain(rpc);
    }
    // 60 days of lookback, as the web asks for.
    expect(web).toMatch(/p_lookback_days: 60/);
    expect(src).toMatch(/p_lookback_days: 60/);
  });

  it("new people means a completed profile from the last week", () => {
    const web = code(WEB);
    const src = body(LOAD);
    for (const clause of ['.eq("profile_completed", true)', "weekAgo"]) {
      expect(web).toContain(clause);
      expect(src).toContain(clause);
    }
    expect(src).toMatch(/7 \* 24 \* 3_600_000/);
  });

  it("interests and profile tags are normalised the same way", () => {
    /*
     * Hashtags are stored with neither convention guaranteed, so "#Art"
     * and "art" have to match. Getting this wrong silently removes the
     * interest boost for everybody.
     */
    expect(interestsOf({ interests: ["#Art", "Music"], profile_tags: ["DESIGN"] })).toEqual(
      new Set(["art", "music", "design"]),
    );
    expect(interestsOf(null)).toEqual(new Set());
    expect(interestsOf({ interests: "not an array" })).toEqual(new Set());
    expect(code(WEB)).toMatch(/replace\(\/\^#\/, ""\)\.toLowerCase\(\)/);
  });

  it("and an embedded profile is read whether it is a row or a list", () => {
    expect(
      normaliseDiscoverPost({ id: "a", profiles: { display_name: "Maya" } }).profiles
        ?.display_name,
    ).toBe("Maya");
    expect(
      normaliseDiscoverPost({ id: "a", profiles: [{ display_name: "Maya" }] }).profiles
        ?.display_name,
    ).toBe("Maya");
    expect(normaliseDiscoverPost({ id: "a", profiles: [] }).profiles).toBeNull();
  });
});

describe("the screen can be reached, and what it does not do", () => {
  it("Discover is routable but not in the bar, as core says", () => {
    const discover = DESTINATIONS.find((d) => d.href === "/discover");
    expect(discover, "Discover has gone from core's navigation").toBeTruthy();
    expect(discover?.bottomBar, "Discover is in the bottom bar now").toBeFalsy();
    expect(existsSync(SCREEN)).toBe(true);
  });

  it("the compass in the top bar is what reaches it", () => {
    /*
     * The glyph is not a literal in TopBar — it renders
     * `DestinationIcon href="/discover"`, and the icon map decides it is a
     * compass. Asserting "Compass" in TopBar was my first version and it
     * failed on correct code; checking the chain is both accurate and more
     * useful, because the map is where it could actually change.
     */
    const bar = body(TOPBAR);
    expect(bar).toMatch(/router\.push\("\/discover"\)/);
    expect(bar).toMatch(/<DestinationIcon href="\/discover"/);
    expect(read("apps/mobile/src/icon-map.ts")).toMatch(
      /"\/discover": \{ kind: "lucide", name: "Compass" \}/,
    );
  });

  it("a tile opens the post's comments, which is the only post screen there is", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/pathname: "\/post\/\[id\]\/comments"/);
    expect(src).toMatch(/params: \{ id: item\.id, owner: item\.user_id \}/);
  });

  it("a person opens their profile, and does nothing without a username", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/pathname: "\/u\/\[username\]"/);
    expect(src).toMatch(/disabled=\{!item\.username\}/);
  });

  it("the trending chips do not pretend to be tappable", () => {
    /*
     * /tag/[tag] is not ported. A chip that looks tappable and is not is
     * worse than one that plainly is not, so they are plain views.
     */
    const src = body(SCREEN);
    const chips = src.slice(src.indexOf("styles.chips"), src.indexOf("PeopleRow title"));
    expect(chips.length, "the chips block could not be found").toBeGreaterThan(0);
    expect(chips, "a chip gained a handler without being announced").not.toMatch(/onPress/);
  });

  it("Shots are left out entirely rather than shown as a tile that cannot play", () => {
    const src = body(LOAD);
    expect(src, "Shots crept into the pool without the player").not.toMatch(/from\("shots"\)/);
    expect(src, "mixShots is called with no Shots to mix").not.toMatch(/mixShots/);
    // And the web does fetch them, so this is a difference worth recording.
    expect(code(WEB)).toMatch(/from\("shots"\)/);
    expect(read(LOAD)).toMatch(/Shots in the pool/);
  });

  it("and what else is missing is written where someone will read it", () => {
    const src = read(LOAD);
    for (const absent of ["category rails", "endless feed", "Following a tag"]) {
      expect(src, `${absent} is no longer recorded as absent`).toContain(absent);
    }
  });

  it("the three states are all said out loud", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/ActivityIndicator/);
    expect(src).toMatch(/Could not load Discover/);
    expect(src).toMatch(/\{error\}/);
    expect(src).toMatch(/Nothing to discover yet/);
    expect(src).toMatch(/accessibilityLabel="Try again"/);
  });

  it("and it leaves the tab bar's room by the shared arithmetic", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/navSpace\(insets\.bottom\)/);
  });
});
