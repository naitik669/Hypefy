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

describe("SpotlightIcon", () => {
  it("gives each copy its own mask, so two on a screen do not share one", () => {
    const html = renderToStaticMarkup(createElement("div", null, createElement(SpotlightIcon), createElement(SpotlightIcon)));
    const ids = [...html.matchAll(/<mask id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
