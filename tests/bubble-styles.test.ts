import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BUBBLE_STYLES, findBubbleStyle, resolveBubble, visibleBubbleStyle } from "@/lib/bubble-styles";
import { findChatTheme } from "@/lib/chat-themes";

/**
 * Your bubble follows you: it wins over the chat theme for your own
 * messages, the theme still dresses everyone else's, Premium bubbles need
 * Premium, and every style matches what the database sells and stays
 * readable.
 */

describe("which bubble a message gets", () => {
  const pond = findChatTheme("theme-pond");

  it("uses the sender's own bubble even inside a themed chat", () => {
    const look = resolveBubble({ mine: true, senderStyleId: "bubble-neon", theme: pond });
    expect(look?.bubble).toEqual(findBubbleStyle("bubble-neon")!.bubble);
  });

  it("gives the other person the theme when they have no style of their own", () => {
    const look = resolveBubble({ mine: false, senderStyleId: null, theme: pond });
    expect(look?.bubble).toEqual(pond!.theirs);
    expect(look?.decor).toBe("pond");
  });

  it("falls back to the app's own bubbles with neither", () => {
    expect(resolveBubble({ mine: true, senderStyleId: null, theme: null })).toBeNull();
  });

  it("shows a Premium bubble only while the sender has Premium, and a bought one always", () => {
    expect(visibleBubbleStyle({ bubble_style: "bubble-glass", is_premium: true })).toBe("bubble-glass");
    expect(visibleBubbleStyle({ bubble_style: "bubble-glass", is_premium: false })).toBeNull();
    expect(visibleBubbleStyle({ bubble_style: "bubble-gold", is_premium: false })).toBe("bubble-gold");
  });
});

describe("the bubble catalogue", () => {
  const sql = readFileSync("supabase/migrations/0078_bubble_styles.sql", "utf8");
  const seeded = new Map<string, { tier: string; price: string }>();
  for (const m of sql.matchAll(/\('(bubble-[a-z]+)',\s*'bubble_style',\s*'(free|premium|shop)',\s*'[^']+',\s*(null|\d+)/g)) {
    seeded.set(m[1], { tier: m[2], price: m[3] });
  }

  it.each(BUBBLE_STYLES.map((b) => [b.id, b] as const))("%s matches its catalogue row", (_, b) => {
    const row = seeded.get(b.id);
    expect(row?.tier).toBe(b.tier);
    expect(row?.price === "null" ? undefined : Number(row?.price)).toBe(b.pricePaise);
  });

  it("draws every bubble the database sells", () => {
    expect([...seeded.keys()].filter((id) => !findBubbleStyle(id))).toEqual([]);
  });

  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  it.each(BUBBLE_STYLES.map((b) => [b.id, b] as const))("%s keeps its text readable", (_, b) => {
    const bg = b.bubble.background.match(/#[0-9a-f]{6}/i)![0];
    const [x, y] = [lum(b.bubble.color), lum(bg)].sort((p, q) => q - p);
    expect((x + 0.05) / (y + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
