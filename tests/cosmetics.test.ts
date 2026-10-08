import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const {
  DECORATIONS, NAME_FONTS, NAME_GLOWS, nameStyle, visibleDecoration,
} = await import("@/lib/cosmetics");
const { bannerGradient, BANNERS, isGifBanner } = await import("@/lib/profile");
const { NAMEPLATES, visibleNameplate } = await import("@/lib/nameplates");
const { NAMEPLATE_ART_IDS } = await import("@/components/ui/Nameplate");

/**
 * Premium styling shows while you have Premium and quietly goes back to
 * plain when you don't; Shop items you bought stay. And every item drawn in
 * code exists in the database catalogue with the same tier, or nobody could
 * ever be allowed to wear it.
 */

describe("who gets styled", () => {
  const styled = { name_font: "font-script", name_glow: "glow-blue", avatar_decoration: "deco-halo" };

  it("styles a Premium member's name and avatar", () => {
    const s = nameStyle({ ...styled, is_premium: true });
    expect(s?.fontFamily).toBeTruthy();
    expect(s?.textShadow).toContain("#3897f0");
    expect(visibleDecoration({ ...styled, is_premium: true })).toBe("deco-halo");
  });

  it("never changes the name's size, whichever font", () => {
    for (const f of NAME_FONTS) {
      const s = nameStyle({ name_font: f.id, is_premium: true });
      expect(s?.fontSize).toBeUndefined();
      // Matched to the default face's x-height, on a line that can't stretch.
      expect(s?.fontSizeAdjust).toBe("0.52");
      expect(s?.lineHeight).toBe("1");
    }
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

  it("falls back to the default banner for a retired or unknown id", () => {
    expect(bannerGradient("banner-aurora")).toBe(BANNERS[0].gradient);
    expect(bannerGradient("purple-night")).toBe(BANNERS[1].gradient);
  });

  it("shows a GIF banner only while its owner has Premium", () => {
    expect(isGifBanner("https://x/banners/u/banner-1.gif")).toBe(true);
    expect(isGifBanner("https://x/banners/u/banner-1.GIF?v=2")).toBe(true);
    expect(isGifBanner("https://x/banners/u/banner-1.jpg")).toBe(false);
    expect(isGifBanner(null)).toBe(false);
  });

  it("shows a nameplate by the same rules as other cosmetics", () => {
    expect(visibleNameplate({ nameplate: "plate-lime", is_premium: true })).toBe("plate-lime");
    expect(visibleNameplate({ nameplate: "plate-lime", is_premium: false })).toBeNull();
    expect(visibleNameplate({ nameplate: "plate-ember", is_premium: false })).toBe("plate-ember");
    expect(visibleNameplate({ nameplate: "plate-nope", is_premium: true })).toBeNull();
  });

  it("has artwork for every nameplate", () => {
    expect(NAMEPLATE_ART_IDS.sort()).toEqual(NAMEPLATES.map((n) => n.id).sort());
  });
});

/**
 * A plate has to sit behind a row without taking it over. The inbox draws
 * its own marks on the right — the time, the pin, the mute bell, the unread
 * count — and the artwork used to be at its loudest exactly there.
 */
describe("a nameplate worn in a list", () => {
  const read = (p: string) => readFileSync(p, "utf8").split("\r\n").join("\n");
  const src = read("src/components/ui/Nameplate.tsx");
  const inbox = read("src/components/messages/MessagesInbox.tsx");

  it("ends before the row's own marks, and the inbox says by how much", () => {
    expect(src).toContain("export const PLATE_FADE_PX = 88;");
    expect(inbox).toContain("fadeRight={PLATE_FADE_PX}");
  });

  it("fades out in pixels, so the art is never resized or clipped", () => {
    // Holding it in a narrower box instead cut the motif off mid-stroke and
    // left a straight seam down the row.
    expect(src).toContain("const RAMP_PX = 130;");
    expect(src).toContain("calc(100% - ${fadeRight + RAMP_PX * (1 - at)}px)");
    expect(src).toContain('overflow: "visible"');
  });

  it("eases away rather than turning a corner into its descent", () => {
    // A straight ramp holds full strength and then turns a corner, and the
    // eye reads that corner as an edge however long the ramp is — which is
    // why lengthening it alone never helped.
    const stops = src.slice(src.indexOf("const FADE_STOPS"), src.indexOf("];", src.indexOf("const FADE_STOPS")));
    const alphas = [...stops.matchAll(/, ([01](?:\.\d+)?)\]/g)].map((m) => Number(m[1]));
    expect(alphas.length).toBeGreaterThan(5);
    expect(alphas[0]).toBe(1);
    expect(alphas[alphas.length - 1]).toBe(0);
    // Strictly falling, and never in one big step.
    alphas.forEach((a, i) => {
      if (i === 0) return;
      expect(a).toBeLessThan(alphas[i - 1]);
      expect(alphas[i - 1] - a).toBeLessThan(0.25);
    });
  });

  it("the motif thins at both ends, so it never meets the fade head-on", () => {
    expect(src).toContain("const MOTIF_MASK");
    expect(src).toContain("transparent 6%");
    expect(src).toContain("transparent 100%");
  });

  it("the wash holds its strength instead of climbing into the fade", () => {
    // At its darkest exactly where it was cut away, a plate ended on a line
    // rather than fading out.
    expect(src).toContain("DAMP}) 70%");
    expect(src).toContain("DAMP}) 100%");
  });

  it("every plate is damped, so a column of them is not a shouting match", () => {
    expect(src).toContain("const DAMP = 0.68;");
    expect(src).toContain("strength * DAMP");
  });

  it("a plate shown on its own is untouched", () => {
    // The Marketplace and Your style show one at a time, where full
    // strength and art to the edge is the point.
    expect(src).toContain("fadeRight = 0,");
    expect(src).toContain("taper ? { WebkitMaskImage: taper, maskImage: taper } : undefined");
  });
});

describe("the catalogue", () => {
  const sql = ["0076_billing", "0078_bubble_styles", "0079_more_cosmetics", "0082_nameplates_gif_banners"]
    .map((m) => readFileSync(`supabase/migrations/${m}.sql`, "utf8"))
    .join("\n");
  const seeded = new Map<string, { kind: string; tier: string }>();
  for (const m of sql.matchAll(/\('([a-z0-9-]+)',\s*'([a-z_]+)',\s*'(free|premium|shop)'/g)) {
    seeded.set(m[1], { kind: m[2], tier: m[3] });
  }
  // Retired later: 0081 deletes Neon, 0082 the Premium banners.
  for (const m of readFileSync("supabase/migrations/0081_remove_neon_frame.sql", "utf8").matchAll(/id = '([a-z0-9-]+)'/g)) {
    seeded.delete(m[1]);
  }
  for (const id of ["banner-aurora", "banner-gold", "banner-holo"]) seeded.delete(id);

  const inCode: [string, string, string][] = [
    ...NAME_FONTS.map((f) => [f.id, "name_font", f.tier] as [string, string, string]),
    ...NAME_GLOWS.map((g) => [g.id, "name_glow", g.tier] as [string, string, string]),
    ...DECORATIONS.map((d) => [d.id, "avatar_decoration", d.tier] as [string, string, string]),
    ...NAMEPLATES.map((n) => [n.id, "nameplate", n.tier] as [string, string, string]),
  ];

  it.each(inCode)("%s is in the database as %s, %s", (id, kind, tier) => {
    expect(seeded.get(id)).toEqual({ kind, tier });
  });

  it("draws everything the database sells", () => {
    const drawn = new Set(inCode.map(([id]) => id));
    const kinds = new Set(["name_font", "name_glow", "avatar_decoration", "profile_theme", "nameplate"]);
    const missing = [...seeded].filter(([id, v]) => kinds.has(v.kind) && !drawn.has(id)).map(([id]) => id);
    expect(missing).toEqual([]);
  });
});
