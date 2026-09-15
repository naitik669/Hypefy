import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CHAT_THEMES, findChatTheme } from "@/lib/chat-themes";

/**
 * Every theme drawn in code is sold by the database under the same id and
 * tier (set_chat_theme refuses anything else), and every one keeps text
 * readable on both kinds of bubble.
 */

const sql = readFileSync("supabase/migrations/0076_billing.sql", "utf8");
const seeded = new Map<string, { tier: string; price: string }>();
for (const m of sql.matchAll(/\('(theme-[a-z]+)',\s*'chat_theme',\s*'(free|premium|shop)',\s*'[^']+',\s*(null|\d+)/g)) {
  seeded.set(m[1], { tier: m[2], price: m[3] });
}

/** WCAG relative luminance of a #rrggbb colour. */
function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** The first solid colour in a background (gradients start with one). */
const firstHex = (css: string) => css.match(/#[0-9a-f]{6}/i)?.[0];

describe("chat themes", () => {
  it.each(CHAT_THEMES.map((t) => [t.id, t] as const))("%s matches its catalogue row", (_, t) => {
    const row = seeded.get(t.id);
    expect(row?.tier).toBe(t.tier);
    expect(row?.price === "null" ? undefined : Number(row?.price)).toBe(t.pricePaise);
  });

  it("draws every theme the database sells", () => {
    expect([...seeded.keys()].filter((id) => !findChatTheme(id))).toEqual([]);
  });

  it.each(CHAT_THEMES.flatMap((t) => [[t.id, "mine", t.mine] as const, [t.id, "theirs", t.theirs] as const]))(
    "%s keeps %s bubbles readable",
    (_, __, bubble) => {
      const bg = firstHex(bubble.background);
      expect(bg).toBeTruthy();
      expect(contrast(bubble.color, bg!)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
