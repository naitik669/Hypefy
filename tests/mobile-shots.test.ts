import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { shotFeedScore } from "../packages/core/src/feed-rank";
import {
  trimOf,
  rankShots,
  normaliseShot,
  SHOT_COLUMNS,
  SHOT_LIMIT,
  type Shot,
} from "../apps/mobile/src/shots/load";

/**
 * The Shots reel.
 *
 * The first screen that needs a native module, and the first that can
 * fail in a way the others cannot: a video player holds a decoder, and a
 * reel that keeps one per off-screen clip runs the phone out of them.
 */

const WEB = "src/app/(app)/shots/page.tsx";
const LOAD = "apps/mobile/src/shots/load.ts";
const SCREEN = "apps/mobile/app/(tabs)/shots.tsx";
const APP_JSON = "apps/mobile/app.json";

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

const shot = (over: Partial<Shot> & { id: string; user_id: string }): Shot => ({
  media_url: "https://example.test/a.mp4",
  poster_url: null,
  caption: null,
  created_at: "2026-11-19T11:00:00.000Z",
  hype_count: 0,
  comment_count: 0,
  save_count: 0,
  duration_secs: null,
  trim_start: null,
  trim_end: null,
  profiles: null,
  ...over,
});

describe("a trimmed Shot plays only what its author kept", () => {
  /*
   * A Shot is trimmed by storing two offsets, not by cutting the file —
   * so a player that ignores them shows footage the author removed, which
   * on a Shot is often exactly what they did not want seen.
   */
  it("no trim means the whole clip", () => {
    expect(trimOf({ duration_secs: 30, trim_start: null, trim_end: null })).toEqual({
      start: 0,
      end: 30,
    });
    expect(trimOf({ duration_secs: null, trim_start: null, trim_end: null })).toEqual({
      start: 0,
      end: null,
    });
  });

  it("a stored zero start is a real value, not an absent one", () => {
    expect(trimOf({ duration_secs: 30, trim_start: 0, trim_end: 10 })).toEqual({
      start: 0,
      end: 10,
    });
  });

  it("an end past the clip is clamped rather than trusted", () => {
    expect(trimOf({ duration_secs: 30, trim_start: 2, trim_end: 99 })).toEqual({
      start: 2,
      end: 30,
    });
  });

  it("and bad data plays the whole thing rather than nothing", () => {
    // An end at or before the start is not a trim. Honouring it would
    // leave a Shot that never advances past its first frame.
    expect(trimOf({ duration_secs: 30, trim_start: 10, trim_end: 10 })).toEqual({
      start: 0,
      end: 30,
    });
    expect(trimOf({ duration_secs: 30, trim_start: 20, trim_end: 5 })).toEqual({
      start: 0,
      end: 30,
    });
  });

  it("a negative start is not a start", () => {
    expect(trimOf({ duration_secs: 30, trim_start: -5, trim_end: 10 }).start).toBe(0);
  });

  it("the player seeks to it, and loops back to it rather than past the end", () => {
    /*
     * expo-video loops the WHOLE file, so a Shot trimmed to its first
     * three seconds would run on into the part that was cut.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/if \(trim\.start > 0\) p\.currentTime = trim\.start/);
    expect(src).toMatch(/player\.currentTime >= \(trim\.end \?\? Infinity\)/);
    expect(src).toMatch(/player\.currentTime = trim\.start/);
  });
});

describe("only the Shot on screen plays", () => {
  it("and only while the tab is on screen", () => {
    /*
     * Two halves. A decoder per off-screen clip is how a phone's video
     * pipeline runs out, and audio from a tab nobody is looking at is
     * worse than no audio — a tab navigator keeps the scene mounted, so
     * a plain effect would not notice the tab being left.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/active=\{index === current && focused\}/);
    expect(src).toMatch(/useFocusEffect\(/);
    expect(src).toMatch(/return \(\) => setFocused\(false\)/);
    expect(src).toMatch(/if \(active\) player\.play\(\);\s*else player\.pause\(\)/);
  });

  it("the window is small enough that decoders do not stack up", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/windowSize=\{3\}/);
    expect(src).toMatch(/initialNumToRender=\{1\}/);
    expect(src).toMatch(/removeClippedSubviews/);
  });

  it("and a clip counts as current only when it is most of the screen", () => {
    /*
     * At 50% a slow swipe makes two clips viewable at once and both take
     * a turn at being the one playing, which is audible.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/itemVisiblePercentThreshold: 80/);
  });

  it("the viewability handler is stable, because changing it throws", () => {
    // FlatList refuses a changed onViewableItemsChanged mid-list. A lazy
    // useState keeps the identity without reading a ref during render,
    // which react-hooks/refs rejects.
    const src = body(SCREEN);
    expect(src).toMatch(/const \[onViewable\] = useState<Viewable>\(/);
    expect(src, "a ref is read during render again").not.toMatch(/useRef\([\s\S]{0,80}\)\.current/);
  });
});

describe("the reel is paged to the screen, not to a guess", () => {
  it("one page per Shot, measured", () => {
    /*
     * A reel that stops between two clips is the single thing that makes
     * a player feel broken, and a hard-coded page height is wrong on
     * every device but the one it was written on.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/useWindowDimensions\(\)/);
    expect(src).toMatch(/const pageHeight = height - navSpace\(insets\.bottom\)/);
    expect(src).toMatch(/snapToInterval=\{pageHeight\}/);
    expect(src).toMatch(/pagingEnabled/);
    expect(src).toMatch(/getItemLayout=/);
  });

  it("and it pads for its own notch, because this tab has no header", () => {
    // Shots is the one tab with headerShown false; every other scene
    // starts below TopBar, which pads for the notch on their behalf.
    expect(body("apps/mobile/app/(tabs)/_layout.tsx")).toMatch(
      /headerShown: d\.href !== "\/shots"/,
    );
    expect(body(SCREEN)).toMatch(/topInset=\{insets\.top\}/);
  });
});

describe("the ranking and the filters are the website's", () => {
  it("shotFeedScore, not a ranking of the phone's own", () => {
    const src = body(LOAD);
    expect(src).toMatch(/shotFeedScore\(/);
    expect(src, "the reel is scoring for itself").not.toMatch(/created_at\)\.getTime/);
  });

  it("a followed author outranks a stranger posted at the same moment", () => {
    const at = "2026-11-19T11:00:00.000Z";
    const out = rankShots(
      [shot({ id: "stranger", user_id: "s", created_at: at }), shot({ id: "friend", user_id: "f", created_at: at })],
      {
        currentUserId: "me",
        following: new Set(["f"]),
        blocked: new Set(),
        hidden: new Set(),
        now: Date.parse("2026-11-19T12:00:00.000Z"),
      },
    );
    expect(out[0].id).toBe("friend");
  });

  it("and it is the same function the ranking test would call directly", () => {
    const at = "2026-11-19T11:00:00.000Z";
    const now = Date.parse("2026-11-19T12:00:00.000Z");
    expect(shotFeedScore(shot({ id: "a", user_id: "f", created_at: at }), false, true, now)).
      toBeGreaterThan(
        shotFeedScore(shot({ id: "b", user_id: "s", created_at: at }), false, false, now),
      );
  });

  it("a blocked or muted author is left out", () => {
    const out = rankShots([shot({ id: "a", user_id: "blocked" }), shot({ id: "b", user_id: "ok" })], {
      currentUserId: "me",
      following: new Set(),
      blocked: new Set(["blocked"]),
      hidden: new Set(),
    });
    expect(out.map((s) => s.id)).toEqual(["b"]);
  });

  it("a hidden Shot is left out without hiding its author", () => {
    const out = rankShots([shot({ id: "hidden", user_id: "a" }), shot({ id: "kept", user_id: "a" })], {
      currentUserId: "me",
      following: new Set(),
      blocked: new Set(),
      hidden: new Set(["hidden"]),
    });
    expect(out.map((s) => s.id)).toEqual(["kept"]);
  });

  it("muted ids join the blocked set, as they do on the feed", () => {
    expect(body(LOAD)).toMatch(/for \(const id of quiet\.muted\) blocked\.add\(id\)/);
  });

  it("one author does not take two slots in a row when it can be avoided", () => {
    const out = rankShots(
      [
        shot({ id: "a1", user_id: "a", hype_count: 100 }),
        shot({ id: "a2", user_id: "a", hype_count: 99 }),
        shot({ id: "b1", user_id: "b", hype_count: 10 }),
      ],
      { currentUserId: "me", following: new Set(), blocked: new Set(), hidden: new Set() },
    );
    expect(out.map((s) => s.user_id)).toEqual(["a", "b", "a"]);
    expect(out.length, "diversify dropped a Shot").toBe(3);
  });
});

describe("a removed Shot never reaches a reel", () => {
  it("the filter is there, on both clients", () => {
    /*
     * Not an optimisation. The select policy allows `removed_at is null
     * OR user_id = auth.uid() OR is_admin()`, which is right for an
     * author's own archive and wrong for a feed — a Shot taken down by a
     * moderator was still served into its author's reel, and every
     * removed Shot on Hypefy into an admin's.
     */
    expect(code(WEB)).toMatch(/\.is\("removed_at", null\)/);
    expect(body(LOAD)).toMatch(/\.is\("removed_at", null\)/);
  });

  it("and the reason is recorded where someone might remove it", () => {
    expect(read(LOAD)).toMatch(/is_admin\(\)|moderator/);
  });
});

describe("the query is the website's query", () => {
  it("the same window", () => {
    // 80, not 60 — I wrote 60, and the assertion against the web's own
    // page caught it. At 60 the phone's reel would end a third early.
    expect(SHOT_LIMIT).toBe(80);
    expect(code(WEB)).toMatch(/\.limit\(80\)/);
  });

  it("the trim columns are asked for, or a trimmed Shot plays whole", () => {
    for (const column of ["duration_secs", "trim_start", "trim_end"]) {
      expect(SHOT_COLUMNS, `${column} is not asked for`).toMatch(
        new RegExp(`(^|[ ,])${column}[,\\s]`),
      );
      expect(code(WEB), `the web no longer reads ${column}`).toContain(column);
    }
  });

  it("and an embedded profile is read whether it is a row or a list", () => {
    expect(normaliseShot({ id: "a", profiles: { display_name: "Maya" } }).profiles?.display_name).toBe(
      "Maya",
    );
    expect(
      normaliseShot({ id: "a", profiles: [{ display_name: "Maya" }] }).profiles?.display_name,
    ).toBe("Maya");
    expect(normaliseShot({ id: "a", profiles: [] }).profiles).toBeNull();
  });
});

describe("the native module, and the version that protects the installed app", () => {
  it("expo-video is a dependency and a config plugin", () => {
    const pkg = JSON.parse(read("apps/mobile/package.json"));
    expect(pkg.dependencies["expo-video"], "expo-video is not installed").toBeTruthy();
    const app = JSON.parse(read(APP_JSON));
    expect(app.expo.plugins, "expo-video is not a config plugin").toContain("expo-video");
  });

  it("the version moved, so the 1.0.0 app is not handed JS that would crash it", () => {
    /*
     * `runtimeVersion` follows `version`. Without the bump, an update
     * carrying a native import would be served to the binary installed
     * before that module existed — which is a crash on launch, not a
     * missing feature.
     */
    const app = JSON.parse(read(APP_JSON));
    expect(app.expo.runtimeVersion).toEqual({ policy: "appVersion" });
    expect(app.expo.version, "the version is still the pre-native one").not.toBe("1.0.0");
  });

  it("and the screen says why the over-the-air run ended", () => {
    expect(read(SCREEN)).toMatch(/runtimeVersion/);
  });
});

describe("the screen can be reached, and what it does not do", () => {
  it("Shots is a destination in the bar", () => {
    expect(existsSync(SCREEN)).toBe(true);
    expect(read("packages/core/src/navigation.ts")).toMatch(/href: "\/shots"/);
  });

  it("hyping works, and goes through the same shared rules as a post", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/useHype\(shot\.id, shot\.user_id/);
    expect(src).toMatch(/onPress=\{hype\.toggle\}/);
  });

  it("comments open the comments screen", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/pathname: "\/post\/\[id\]\/comments"/);
    expect(src).toMatch(/params: \{ id: shot\.id, owner: shot\.user_id \}/);
  });

  it("sharing is a count, not a button", () => {
    /*
     * The rail's handlers went from two to three when the More button
     * (report and block, tests/mobile-safety.test.ts) arrived. Share is
     * still the one with none.
     */
    const src = body(SCREEN);
    const rail = src.slice(src.indexOf("styles.rail,"), src.indexOf("styles.foot,"));
    expect(rail.length, "the rail block could not be found").toBeGreaterThan(0);
    expect(
      [...rail.matchAll(/onPress/g)].length,
      "an action gained a handler without being announced",
    ).toBe(3);
    expect(rail).toMatch(/onPress=\{\(\) => setMenuOpen\(true\)\}/);
    expect(rail).toMatch(/<View style=\{styles\.railItem\}>\s*<ShareIcon/);
  });

  it("the author opens their profile, and nothing happens without a username", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/pathname: "\/u\/\[username\]"/);
    expect(src).toMatch(/disabled=\{!profile\?\.username\}/);
  });

  it("the three states are said out loud, and empty is not blank", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/ActivityIndicator/);
    expect(src).toMatch(/Could not load Shots/);
    expect(src).toMatch(/\{error\}/);
    expect(src).toMatch(/No Shots yet/);
  });

  it("and what is not ported is written down", () => {
    const src = read(LOAD);
    for (const absent of ["Ghost Share", "seen penalty", "Affinity", "Music"]) {
      expect(src, `${absent} is no longer recorded as absent`).toContain(absent);
    }
  });
});
