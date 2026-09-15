import type { CSSProperties } from "react";

/**
 * How Premium and Shop items look. The database holds who owns what
 * (public.products, owns_product) under the same ids; this file holds only
 * the drawing, so an id added here without a catalogue row can't be worn.
 *
 * The rule for showing an item mirrors ownership: a Premium item shows while
 * its wearer has Premium, so a lapsed plan quietly drops back to plain; a
 * Shop item was bought and shows for good.
 *
 * The name faces are loaded once in the root layout (see NAME_FONT_VARIABLES
 * there) and referenced here by CSS variable, which keeps this file plain
 * code that anything — tests included — can import.
 */

export type Tier = "free" | "premium" | "shop";

export type NameFont = { id: string; label: string; family: string; weight: number; italic?: boolean; scale: number; tier: Tier };

/** `scale` evens out faces that draw much larger or smaller at the same size. */
export const NAME_FONTS: NameFont[] = [
  { id: "font-script", label: "Script", family: "var(--font-name-script), cursive", weight: 400, scale: 1.05, tier: "premium" },
  { id: "font-block", label: "Block", family: "var(--font-name-block), sans-serif", weight: 400, scale: 0.86, tier: "premium" },
  { id: "font-retro", label: "Retro", family: "var(--font-name-retro), sans-serif", weight: 400, scale: 1, tier: "premium" },
  { id: "font-marker", label: "Marker", family: "var(--font-name-marker), cursive", weight: 400, scale: 1, tier: "premium" },
  { id: "font-pixel", label: "Pixel", family: "var(--font-name-pixel), monospace", weight: 700, scale: 0.84, tier: "premium" },
  { id: "font-classic", label: "Classic", family: "var(--font-name-classic), serif", weight: 800, italic: true, scale: 1.08, tier: "premium" },
];

export type NameGlow = { id: string; label: string; color: string; tier: Tier };

export const NAME_GLOWS: NameGlow[] = [
  { id: "glow-lime", label: "Lime", color: "#a3e635", tier: "premium" },
  { id: "glow-blue", label: "Blue", color: "#3897f0", tier: "premium" },
  { id: "glow-pink", label: "Pink", color: "#ff4fa3", tier: "premium" },
  { id: "glow-gold", label: "Gold", color: "#ffd000", tier: "premium" },
  { id: "glow-violet", label: "Violet", color: "#a855f7", tier: "premium" },
  { id: "glow-ice", label: "Ice", color: "#7dd3fc", tier: "premium" },
];

export type Decoration = { id: string; label: string; tier: Tier; pricePaise?: number };

export const DECORATIONS: Decoration[] = [
  { id: "deco-halo", label: "Halo", tier: "premium" },
  { id: "deco-sparkle", label: "Sparkle", tier: "premium" },
  { id: "deco-neon", label: "Neon", tier: "premium" },
  { id: "deco-flames", label: "Flames", tier: "shop", pricePaise: 4900 },
  { id: "deco-crown", label: "Crown", tier: "shop", pricePaise: 4900 },
  { id: "deco-hearts", label: "Hearts", tier: "shop", pricePaise: 4900 },
  { id: "deco-holo", label: "Holo foil", tier: "shop", pricePaise: 7900 },
  { id: "deco-8bit", label: "8-bit", tier: "shop", pricePaise: 4900 },
  { id: "deco-bolt", label: "Bolt", tier: "premium" },
  { id: "deco-petals", label: "Petals", tier: "premium" },
  { id: "deco-hypestar", label: "Hype star", tier: "premium" },
  { id: "deco-gilded", label: "Gilded", tier: "shop", pricePaise: 9900 },
];

export type PremiumBanner = { id: string; label: string; gradient: string; tier: Tier };

export const PREMIUM_BANNERS: PremiumBanner[] = [
  {
    id: "banner-aurora",
    label: "Aurora",
    tier: "premium",
    gradient:
      "radial-gradient(90% 120% at 10% 0%, rgba(74,222,128,0.55), transparent 60%), radial-gradient(90% 120% at 90% 10%, rgba(56,189,248,0.5), transparent 60%), radial-gradient(80% 100% at 50% 110%, rgba(168,85,247,0.55), transparent 60%), #06070d",
  },
  {
    id: "banner-gold",
    label: "Gold Rush",
    tier: "premium",
    gradient:
      "radial-gradient(70% 120% at 20% -10%, rgba(255,236,160,0.65), transparent 55%), linear-gradient(120deg, #3a2a05 0%, #a8781a 40%, #f5cf63 55%, #8a5a0e 75%, #2a1c03 100%)",
  },
  {
    id: "banner-holo",
    label: "Holo",
    tier: "premium",
    gradient:
      "radial-gradient(60% 90% at 30% 20%, rgba(255,255,255,0.35), transparent 60%), linear-gradient(115deg, #ff9ad5 0%, #a5b4fc 25%, #7dd3fc 45%, #86efac 65%, #fde68a 85%, #ff9ad5 100%)",
  },
];

/** Whoever wears it: may this item be drawn? */
export function canShow(tier: Tier | undefined, isPremium: boolean): boolean {
  if (!tier) return false;
  return tier === "premium" ? isPremium : true;
}

export const findFont = (id: string | null | undefined) => NAME_FONTS.find((f) => f.id === id);
export const findGlow = (id: string | null | undefined) => NAME_GLOWS.find((g) => g.id === id);
export const findDecoration = (id: string | null | undefined) => DECORATIONS.find((d) => d.id === id);
export const findPremiumBanner = (id: string | null | undefined) => PREMIUM_BANNERS.find((b) => b.id === id);

/** The name's style for someone, with anything they can no longer wear dropped. */
export function nameStyle(
  p: { name_font?: string | null; name_glow?: string | null; is_premium?: boolean | null },
): CSSProperties | undefined {
  const premium = !!p.is_premium;
  const font = findFont(p.name_font);
  const glow = findGlow(p.name_glow);
  const style: CSSProperties = {};
  if (font && canShow(font.tier, premium)) {
    style.fontFamily = font.family;
    style.fontSize = `${font.scale}em`;
    style.fontWeight = font.weight;
    if (font.italic) style.fontStyle = "italic";
    style.letterSpacing = "0.01em";
  }
  if (glow && canShow(glow.tier, premium)) {
    style.color = `color-mix(in srgb, ${glow.color} 30%, #ffffff)`;
    style.textShadow = `0 0 6px ${glow.color}cc, 0 0 16px ${glow.color}80`;
  }
  return Object.keys(style).length ? style : undefined;
}

/** The decoration someone may wear right now, if any. */
export function visibleDecoration(
  p: { avatar_decoration?: string | null; is_premium?: boolean | null },
): string | null {
  const d = findDecoration(p.avatar_decoration);
  return d && canShow(d.tier, !!p.is_premium) ? d.id : null;
}

/** Columns every select that draws a name or avatar needs. */
export const COSMETIC_COLUMNS = "is_premium, name_font, name_glow, avatar_decoration";
