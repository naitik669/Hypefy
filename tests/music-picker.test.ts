// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  loadRecentSearches,
  rememberSearch,
  forgetSearches,
  RECENT_MAX,
  RECENT_SHOWN,
} from "@/lib/recent-searches";
import { SOUND_CATEGORIES } from "@/lib/sound-categories";

/**
 * The song picker before anything is typed: two halves, what you looked
 * for last, and a grid to browse. Saved sounds already existed; recents
 * and the grid are what this adds.
 */

const read = (p: string) => readFileSync(p, "utf8").split("\r\n").join("\n");
const src = read("src/components/music/TrackPicker.tsx");

describe("what you looked for last", () => {
  beforeEach(() => localStorage.clear());

  it("keeps them newest first", () => {
    rememberSearch("doja cat");
    rememberSearch("sad lofi");
    expect(loadRecentSearches()).toEqual(["sad lofi", "doja cat"]);
  });

  it("the same search twice is one entry, however it was capitalised", () => {
    rememberSearch("Doja Cat");
    rememberSearch("  doja cat  ");
    expect(loadRecentSearches()).toEqual(["doja cat"]);
  });

  it("an empty search is not a search", () => {
    rememberSearch("   ");
    expect(loadRecentSearches()).toEqual([]);
  });

  it("stops at a sensible number", () => {
    for (let i = 0; i < RECENT_MAX + 6; i++) rememberSearch(`q${i}`);
    expect(loadRecentSearches()).toHaveLength(RECENT_MAX);
    expect(loadRecentSearches()[0]).toBe(`q${RECENT_MAX + 5}`);
  });

  it("can be forgotten", () => {
    rememberSearch("something");
    expect(forgetSearches()).toEqual([]);
    expect(loadRecentSearches()).toEqual([]);
  });

  it("survives junk in storage rather than throwing", () => {
    localStorage.setItem("hypefy:music:recent", "{not json");
    expect(loadRecentSearches()).toEqual([]);
  });

  /**
   * Two guards that were only ever exercised through the writer, so
   * removing either left the suite green.
   *
   * Both matter for the same reason: what is in storage was not necessarily
   * put there by this version of the code. A list written by an older build
   * with a larger cap, or a value hand-edited, arrives here as-is.
   */
  it("caps a list that was stored longer than the cap", () => {
    const tooMany = Array.from({ length: 25 }, (_, i) => `q${i}`);
    localStorage.setItem("hypefy:music:recent", JSON.stringify(tooMany));
    expect(loadRecentSearches()).toHaveLength(RECENT_MAX);
    expect(loadRecentSearches()[0]).toBe("q0");
  });

  it("and refuses a stored list that is not all strings", () => {
    // The picker renders these straight into a list. A number or an object
    // reaching it would render as "[object Object]" at best.
    localStorage.setItem("hypefy:music:recent", JSON.stringify(["ok", 7, { a: 1 }, null]));
    expect(loadRecentSearches()).toEqual([]);
  });

  it("stays on the device", () => {
    // A half-typed search is a thought, not a setting; syncing those
    // between phones is a privacy cost with nothing on the other side.
    //
    // This asserted `toContain("localStorage")` while the module lived in
    // src/lib. It now lives in @hypefy/core behind the Kv interface, which
    // is what lets the native client keep the same list in MMKV — and core
    // may not mention localStorage at all, so the old spelling of this
    // guarantee had to change with it.
    //
    // A GENUINE assertion change, not a path literal: what is checked is
    // different text. The guarantee is the same one and is still the point —
    // device-local storage, and no server anywhere near it.
    const lib = read("packages/core/src/recent-searches.ts");
    expect(lib).toContain("@hypefy/core/kv");
    expect(lib).not.toContain("supabase");
    expect(lib).not.toContain("fetch(");
    // And the store it reaches for is a device store rather than the
    // network: the interface itself is three synchronous methods.
    const kvSrc = read("packages/core/src/kv.ts");
    expect(kvSrc).not.toContain("supabase");
    expect(kvSrc).not.toContain("fetch(");
  });
});

describe("the browse grid", () => {
  it("every tile is a search, and says so in the type", () => {
    // Apple's endpoint has no mood filter, so a category IS a query.
    expect(SOUND_CATEGORIES.length).toBeGreaterThanOrEqual(4);
    for (const c of SOUND_CATEGORIES) {
      expect(c.query.trim().length).toBeGreaterThan(0);
      expect(c.label.trim().length).toBeGreaterThan(0);
      expect(c.from).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.to).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("tapping one runs its search", () => {
    expect(src).toContain("onClick={() => setQuery(c.query)}");
  });
});

describe("what the picker shows when", () => {
  it("results win over everything", () => {
    expect(src).toContain("const showResults = typed || loading;");
  });

  it("reaching for search answers with what is trending", () => {
    expect(src).toContain("const showTrending = !showResults && focused;");
    expect(src).toContain('{ title: "Trending now", items: shelf.trending }');
  });

  it("otherwise it is the two halves", () => {
    expect(src).toContain("const browsing = !showResults && !showTrending;");
    expect(src).toContain('role="tablist"');
    expect(src).toContain('["foryou", "For you"], ["saved", "Saved"]');
  });

  it("only the first few recents show, with the rest behind See more", () => {
    expect(RECENT_SHOWN).toBe(3);
    expect(src).toContain("allRecent ? recent : recent.slice(0, RECENT_SHOWN)");
    expect(src).toContain("recent.length > RECENT_SHOWN ?");
  });

  it("For you opens on songs, with Browse beneath them", () => {
    // It used to end on "search for a song to attach" — a page of nothing
    // under a box you had already decided not to type in.
    expect(src).toContain("const FOR_YOU_SHOWN = 4;");
    expect(src).toContain("const forYou = allForYou ? shelf.trending : shelf.trending.slice(0, FOR_YOU_SHOWN);");
    expect(src.indexOf('<p className="text-xs font-bold uppercase tracking-widest text-faint">For you</p>'))
      .toBeLessThan(src.indexOf(">Browse</p>"));
    expect(src).toContain("{allForYou ? \"Show less\" : \"See more\"}");
  });

  it("a browse tile carries artwork under its colour", () => {
    expect(src).toContain("opacity-20 mix-blend-overlay");
    expect(src).toContain("shelf.trending[i % Math.max(1, shelf.trending.length)]?.artwork");
    // Decorative: it is texture, never something to read.
    expect(src).toContain('alt=""');
  });

  it("every list draws the same row", () => {
    expect(src).toContain("function SongRow(");
    // Two places draw songs: the shared list (results, trending, saved)
    // and For you's own.
    expect(src.split("<SongRow").length - 1).toBe(2);
  });

  it("a search is remembered once it has run, not once per keystroke", () => {
    const debounced = src.slice(src.indexOf("debounceRef.current = setTimeout"));
    expect(debounced).toContain("setRecent(rememberSearch(q));");
  });

  it("an empty shelf is not a shelf", () => {
    // Left in, an empty group counted as content: the "nothing saved yet"
    // notice never got its turn and the sheet closed up to nothing.
    expect(src).toContain('[{ title: null, items: shelf.saved }].filter((g) => g.items.length > 0)');
    expect(src).toContain('title="Nothing saved yet"');
  });
});
