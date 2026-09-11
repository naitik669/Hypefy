// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMOJI_GROUPS, quickRow, recentEmoji, rememberEmoji, RECENT_MAX, searchEmoji } from "@/lib/emoji";
import { SquircleSwatch, SQUIRCLE } from "@/components/ui/SquircleSwatch";
import { SpotlightIcon } from "@/components/diary/SpotlightIcon";

describe("searchEmoji", () => {
  it("finds emoji by the words they go by, whole-word starts first", () => {
    const hearts = searchEmoji("heart");
    expect(hearts).toContain("❤️");
    expect(hearts).toContain("💔");
    expect(searchEmoji("chai")).toContain("☕");
    expect(searchEmoji("lol").slice(0, 3)).toContain("😂");
  });

  it("finds nothing for nothing, and each emoji once", () => {
    expect(searchEmoji("   ")).toEqual([]);
    const all = searchEmoji("e", 1000);
    expect(new Set(all).size).toBe(all.length);
  });

  it("lists no emoji twice within a group", () => {
    for (const g of EMOJI_GROUPS) {
      const list = g.emoji.map(([e]) => e);
      expect(new Set(list).size, g.key).toBe(list.length);
    }
  });
});

describe("recent emoji", () => {
  beforeEach(() => localStorage.clear());

  it("puts the latest first, once, and keeps a bounded list", () => {
    rememberEmoji("🔥");
    rememberEmoji("🌙");
    rememberEmoji("🔥");
    expect(recentEmoji.get()).toEqual(["🔥", "🌙"]);
    for (let i = 0; i < RECENT_MAX + 5; i++) rememberEmoji(String.fromCodePoint(0x1f600 + i));
    expect(recentEmoji.get()).toHaveLength(RECENT_MAX);
  });

  it("hands back the same array until something changes, as useSyncExternalStore needs", () => {
    rememberEmoji("✨");
    expect(recentEmoji.get()).toBe(recentEmoji.get());
    expect(recentEmoji.server()).toBe(recentEmoji.server());
  });

  it("survives junk in storage", () => {
    localStorage.setItem("hypefy.emoji.recent", "{not json");
    expect(recentEmoji.get()).toEqual([]);
  });

  it("fills the quick line with your recents, then the defaults, without repeats", () => {
    expect(quickRow(["🌙", "🔥"], ["🔥", "✨", "🎧"], 4)).toEqual(["🌙", "🔥", "✨", "🎧"]);
  });
});

describe("SquircleSwatch", () => {
  it("is a squircle, not a circle, and says which colour is chosen", () => {
    expect(SQUIRCLE.startsWith("polygon(")).toBe(true);
    const on = renderToStaticMarkup(createElement(SquircleSwatch, { background: "red", selected: true, label: "Ember", onClick: () => {} }));
    const off = renderToStaticMarkup(createElement(SquircleSwatch, { background: "red", selected: false, label: "Ember", onClick: () => {} }));
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain("<polygon");
    expect(off).not.toContain("<polygon");
    expect(on).not.toContain("rounded-full");
  });
});

describe("page colours", () => {
  it("come in groups of at most eight — one line each — with keys the database takes", async () => {
    const { COLOR_GROUPS, DIARY_COLORS } = await import("@/components/diary/DiaryPage");
    expect(COLOR_GROUPS.length).toBeGreaterThan(1);
    for (const g of COLOR_GROUPS) expect(g.colors.length, g.key).toBeLessThanOrEqual(8);
    const keys = DIARY_COLORS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z]{2,16}$/); // set_note's check
    expect(COLOR_GROUPS.flatMap((g) => g.colors).length).toBe(DIARY_COLORS.length);
  });

  it("draws a Glow colour as a blend of its two inks, and anything unknown as Ink", async () => {
    const { diaryTheme, colorKey, pageTint } = await import("@/components/diary/DiaryPage");
    const sunset = diaryTheme("sunset", 200);
    expect(sunset.background).toContain("hsl(14 ");
    expect(sunset.background).toContain("hsl(334 ");
    expect(sunset.burn).toContain("linear-gradient");
    expect(colorKey("neon")).toBe("ink");
    expect(diaryTheme("neon", 200)).toEqual(pageTint(200));
  });

  it("opens the colour line on the group holding the chosen colour", async () => {
    const { ColorPager } = await import("@/components/ui/ColorPager");
    const { pageColorGroups } = await import("@/components/diary/DiaryPage");
    const html = renderToStaticMarkup(createElement(ColorPager, { groups: pageColorGroups(200), value: "sage", onChange: () => {} }));
    expect(html).toMatch(/aria-label="Dusk colours" aria-current="true"/);
    expect(html).toContain('aria-label="Sage"');
  });
});

describe("SpotlightIcon", () => {
  it("gives each copy its own mask, so two on a screen do not share one", () => {
    const html = renderToStaticMarkup(createElement("div", null, createElement(SpotlightIcon), createElement(SpotlightIcon)));
    const ids = [...html.matchAll(/<mask id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
