import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  CONTENT_SORTS,
  CREATOR_TABS,
  interactionRate,
  interactions,
  num,
  readSort,
  readTab,
  shareTarget,
  sortItems,
  watchTime,
  type ItemRow,
} from "@/lib/creator-content";
import { oldestFirst } from "@/lib/creator-overview";
import { rebase } from "@/lib/chart-scale";

/**
 * The dashboard's Content and Audience tabs.
 *
 * Two kinds of guarantee here. The sorting, the rates and the rebased axis
 * are logic, tested by handing them values and reading the answer back.
 * The rest is structural: that one tab's data is not fetched to sit behind
 * another, and above all that the thirty-day window asks for the right
 * thirty days — which it did not when the Overview shipped.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
/** The file with its comments stripped, so a comment cannot satisfy an assertion. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const page = code("src/app/(app)/creator/page.tsx");
const insights = code("src/app/(app)/profile/insights/page.tsx");
const list = code("src/components/creator/ContentList.tsx");
const sheet = code("src/components/creator/ItemDetailSheet.tsx");
const audience = code("src/components/creator/Audience.tsx");

const row = (over: Partial<ItemRow> = {}): ItemRow => ({
  kind: "post",
  id: "a",
  caption: null,
  cover: null,
  created_at: "2026-11-01T00:00:00Z",
  views: 0,
  reach: 0,
  hypes: 0,
  comments: 0,
  saves: 0,
  avg_completion: null,
  ...over,
});

describe("which tab", () => {
  it("defaults to the overview, including for a made-up name", () => {
    expect(readTab(undefined)).toBe("overview");
    expect(readTab("audience")).toBe("audience");
    expect(readTab("content")).toBe("content");
    expect(readTab("everything")).toBe("overview");
    expect(readTab("__proto__")).toBe("overview");
  });

  it("and the overview is first, because it is what opening it should show", () => {
    expect(CREATOR_TABS[0]).toBe("overview");
  });

  it("one tab's data is fetched at a time", () => {
    // The whole point of naming the tab in the address rather than holding
    // it in state: four queries to draw the Overview is four queries, not
    // four plus the two the Audience tab would need behind it.
    for (const t of ["Content", "AudienceTab", "Overview"]) {
      expect(page, t).toMatch(new RegExp(`async function ${t}\\(`));
    }
    expect(page).toContain('{which === "content" && <Content');
    expect(page).toContain('{which === "audience" && <AudienceTab');
  });
});

describe("the thirty days asked for are the last thirty", () => {
  it("oldestFirst puts a newest-first answer back in reading order", () => {
    expect(oldestFirst([3, 2, 1])).toEqual([1, 2, 3]);
    expect(oldestFirst([])).toEqual([]);
  });

  it("and does not touch what it was given", () => {
    const rows = [1, 2, 3];
    oldestFirst(rows);
    expect(rows).toEqual([1, 2, 3]);
  });

  it("every reader orders descending, which is the only way a limit takes the newest", () => {
    // The bug this replaces: `order("day", { ascending: true }).limit(30)`
    // against eighty-one days of history drew a chart of 27 Aug to 25 Sep
    // and called it the last thirty days, with a follower change measured
    // across the wrong month. Both readers had it.
    for (const [name, src] of [
      ["creator", page],
      ["insights", insights],
    ] as const) {
      expect(src, name).toContain('.order("day", { ascending: false })');
      expect(src, name).not.toContain('.order("day", { ascending: true })');
      expect(src, name).toContain("oldestFirst(");
    }
  });

  it("and the creator page reverses what it fetched rather than only importing the helper", () => {
    // Counted, because an import line alone would satisfy a contains check
    // on the name: the Overview and the Audience tab each read the rows.
    expect(page.match(/oldestFirst\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("ordering the content list", () => {
  const a = row({ id: "a", views: 10, reach: 10, hypes: 1, created_at: "2026-11-03T00:00:00Z" });
  const b = row({ id: "b", views: 90, reach: 3, hypes: 0, created_at: "2026-11-01T00:00:00Z" });
  const c = row({ id: "c", views: 20, reach: 20, hypes: 9, created_at: "2026-11-02T00:00:00Z" });

  const ids = (by: Parameters<typeof sortItems>[1]) => sortItems([b, a, c], by).map((r) => r.id);

  it("newest first by date", () => {
    expect(ids("recent")).toEqual(["a", "c", "b"]);
  });

  it("views counts every time it was seen", () => {
    expect(ids("views")).toEqual(["b", "c", "a"]);
  });

  it("people counts the people, which is a different order", () => {
    expect(ids("people")).toEqual(["c", "a", "b"]);
  });

  it("reactions adds up everything somebody chose to do", () => {
    expect(ids("talked")).toEqual(["c", "a", "b"]);
  });

  it("ties break on recency, so the order does not wobble between renders", () => {
    const old = row({ id: "old", views: 5, created_at: "2026-10-01T00:00:00Z" });
    const fresh = row({ id: "fresh", views: 5, created_at: "2026-11-09T00:00:00Z" });
    expect(sortItems([old, fresh], "views").map((r) => r.id)).toEqual(["fresh", "old"]);
    expect(sortItems([fresh, old], "views").map((r) => r.id)).toEqual(["fresh", "old"]);
  });

  it("and the list it was given is left alone", () => {
    // In an order the sort would change: [b, a] is already correct by
    // views, so an in-place sort of it would leave the same array and
    // this would pass against a function that mutates.
    const rows = [a, b];
    sortItems(rows, "views");
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("an unknown sort is newest, not a crash or an empty list", () => {
    expect(readSort("by-vibes")).toBe("recent");
    expect(readSort(undefined)).toBe("recent");
    expect(sortItems([b, a, c], readSort("by-vibes")).map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("every sort offered is one sortItems knows", () => {
    // A chip whose key sortItems does not handle falls through to the
    // recent branch and looks like it worked.
    for (const s of CONTENT_SORTS) expect(readSort(s.key)).toBe(s.key);
  });
});

describe("the numbers on a row", () => {
  it("a bigint arriving as a string is still a number", () => {
    expect(num("2087")).toBe(2087);
    expect(num(12)).toBe(12);
  });

  it("and nothing at all is nought rather than NaN", () => {
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num("not a number")).toBe(0);
  });

  it("interactions is hype, comments and saves together", () => {
    expect(interactions(row({ hypes: 3, comments: 2, saves: 1 }))).toBe(6);
  });

  it("the rate is per hundred people reached", () => {
    expect(interactionRate(row({ reach: 100, hypes: 12 }))).toBe(12);
    expect(interactionRate(row({ reach: 40, hypes: 2, comments: 2 }))).toBe(10);
  });

  it("and is null when nobody saw it, because nought per cent is a claim", () => {
    // The same reason avg_completion is null on an unwatched Shot. "0"
    // says nobody reacted; this says nobody looked.
    expect(interactionRate(row({ reach: 0, hypes: 5 }))).toBe(null);
    expect(interactionRate(row({ reach: null }))).toBe(null);
  });
});

describe("the detail sheet", () => {
  it("asks for the share breakdown under the name the function expects", () => {
    expect(shareTarget("shot")).toBe("shot");
    expect(shareTarget("post")).toBe("post");
    // record_share rejects anything outside post/shot/show/profile, so an
    // unrecognised kind must not be passed through as itself.
    expect(shareTarget("album")).toBe("post");
  });

  it("fetches the slow numbers on open, not with the list", () => {
    // Fifty rows times two queries to fill a list nobody has tapped.
    expect(sheet).toContain('supabase.rpc("share_breakdown"');
    expect(sheet).toContain('supabase.rpc("shot_watch_summary"');
    expect(page).not.toContain("share_breakdown");
    expect(page).not.toContain("shot_watch_summary");
  });

  it("and only asks about watch time for a Shot", () => {
    // A post has no watch stats; asking anyway is a guaranteed empty
    // round trip per post opened.
    expect(sheet).toContain('kind === "shot"');
    const call = sheet.indexOf('supabase.rpc("shot_watch_summary"');
    const guard = sheet.lastIndexOf('kind === "shot"', call);
    expect(guard).toBeGreaterThan(-1);
    expect(call - guard).toBeLessThan(120);
  });

  it("a watch time is said in units somebody reads", () => {
    expect(watchTime(0)).toBe("0s");
    expect(watchTime(8_400)).toBe("8s");
    expect(watchTime(90_000)).toBe("1m 30s");
    expect(watchTime(3_600_000)).toBe("1h 0m");
    expect(watchTime(7_380_000)).toBe("2h 3m");
  });

  it("and a negative one does not come out as a minus", () => {
    // Big enough that rounding does not do the clamping for us: -500ms
    // rounds to -0 and prints "0s" with or without the guard.
    expect(watchTime(-90_000)).toBe("0s");
  });
});

describe("the content list", () => {
  it("sorts in the browser rather than round-tripping the same rows", () => {
    expect(list).toContain("sortItems(items, by)");
    expect(list).not.toContain("router.push");
  });

  it("a row opens the sheet, and the post itself is one tap further in", () => {
    // Tapping a row in a list of numbers to be taken away from the numbers
    // is the wrong destination; it was a Link to the post before this.
    expect(list).toContain("setOpen(row)");
    expect(list).not.toContain("<Link");
    expect(sheet).toContain("itemHref(");
  });
});

describe("the audience tab earns its place", () => {
  it("the reach split lives here and not also on the overview", () => {
    expect(audience).toContain("<Donut");
    expect(page).not.toContain("<Donut");
    expect(page).not.toContain("reach_following");
  });

  it("followers are a level over time, drawn as a line", () => {
    expect(audience).toContain("<LineChart");
    expect(audience).toContain("d.followers");
  });

  it("and it says in words whether the work is leaving the bubble", () => {
    expect(audience).toContain("don't follow you yet");
  });
});

describe("a chart of a level that does not start at zero", () => {
  it("moves the floor out of the values and back onto the axis", () => {
    // 1,204 to 1,241 is a month of work and, plotted from zero, a flat
    // line at the top of the box.
    const { values, max, floor } = rebase([1204, 1220, 1241]);
    expect(floor).toBe(1204);
    expect(max).toBe(37);
    expect(values).toEqual([0, 16, 37]);
    expect(floor + max).toBe(1241);
  });

  it("a series that never moves sits in the middle, not on the axis", () => {
    // On its own floor it would sit exactly on the baseline, which reads
    // as nought rather than as steady.
    const { values, max, floor } = rebase([50, 50, 50]);
    expect(values).toEqual([1, 1, 1]);
    expect(max).toBe(2);
    expect(floor).toBe(49);
    expect(values[0] / max).toBe(0.5);
  });

  it("and an empty series is a drawable nothing rather than a divide by zero", () => {
    const { values, max } = rebase([]);
    expect(values).toEqual([]);
    expect(max).toBeGreaterThan(0);
  });

  it("the line chart refuses to draw a trend from one point", () => {
    const chart = code("src/components/charts/LineChart.tsx");
    expect(chart).toContain("points.length < 2");
    expect(chart).toContain("rebase(raw)");
  });

  it("and says what it drew, since an SVG of a path says nothing", () => {
    const chart = code("src/components/charts/LineChart.tsx");
    expect(chart).toContain('role="img"');
    expect(chart).toContain("aria-label={summary}");
  });
});
