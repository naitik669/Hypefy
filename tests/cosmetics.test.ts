import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const {
  DECORATIONS, NAME_FONTS, NAME_GLOWS, PREMIUM_BANNERS, nameStyle, visibleDecoration,
} = await import("@/lib/cosmetics");
const { bannerGradient, BANNERS } = await import("@/lib/profile");

/**
 * Premium styling shows while you have Premium and quietly goes back to
 * plain when you don't; Shop items you bought stay. And every item drawn in
 * code exists in the database catalogue with the same tier, or nobody could
 * ever be allowed to wear it.
 */

describe("who gets styled", () => {
  const styled = { name_font: "font-script", name_glow: "glow-blue", avatar_decoration: "deco-neon" };

  it("styles a Premium member's name and avatar", () => {
    const s = nameStyle({ ...styled, is_premium: true });
    expect(s?.fontFamily).toBeTruthy();
    expect(s?.textShadow).toContain("#3897f0");
    expect(visibleDecoration({ ...styled, is_premium: true })).toBe("deco-neon");
  });

  it("drops Premium styling when the plan lapses", () => {
    expect(nameStyle({ ...styled, is_premium: false })).toBeUndefined();
    expect(visibleDecoration({ ...styled, is_premium: false })).toBeNull();
  });

  it("keeps a bought Shop decoration without Premium", () => {
    expect(visibleDecoration({ avatar_decoration: "deco-crown", is_premium: false })).toBe("deco-crown");
  });

  it("ignores ids it does not know", () => {
    expect(nameStyle({ name_font: "font-comic", is_premium: true })).toBeUndefined();
    expect(visibleDecoration({ avatar_decoration: "deco-nope", is_premium: true })).toBeNull();
  });

  it("draws a Premium banner only for Premium, and falls back to the default", () => {
    const aurora = PREMIUM_BANNERS[0];
    expect(bannerGradient(aurora.id, true)).toBe(aurora.gradient);
    expect(bannerGradient(aurora.id, false)).toBe(BANNERS[0].gradient);
    expect(bannerGradient("purple-night", false)).toBe(BANNERS[1].gradient);
  });
});

describe("the catalogue", () => {
  const sql = readFileSync("supabase/migrations/0076_billing.sql", "utf8");
  const seeded = new Map<string, { kind: string; tier: string }>();
  for (const m of sql.matchAll(/\('([a-z-]+)',\s*'([a-z_]+)',\s*'(free|premium|shop)'/g)) {
    seeded.set(m[1], { kind: m[2], tier: m[3] });
  }

  const inCode: [string, string, string][] = [
    ...NAME_FONTS.map((f) => [f.id, "name_font", f.tier] as [string, string, string]),
    ...NAME_GLOWS.map((g) => [g.id, "name_glow", g.tier] as [string, string, string]),
    ...DECORATIONS.map((d) => [d.id, "avatar_decoration", d.tier] as [string, string, string]),
    ...PREMIUM_BANNERS.map((b) => [b.id, "profile_theme", b.tier] as [string, string, string]),
  ];

  it.each(inCode)("%s is in the database as %s, %s", (id, kind, tier) => {
    expect(seeded.get(id)).toEqual({ kind, tier });
  });

  it("draws everything the database sells", () => {
    const drawn = new Set(inCode.map(([id]) => id));
    const kinds = new Set(["name_font", "name_glow", "avatar_decoration", "profile_theme"]);
    const missing = [...seeded].filter(([id, v]) => kinds.has(v.kind) && !drawn.has(id)).map(([id]) => id);
    expect(missing).toEqual([]);
  });
});
