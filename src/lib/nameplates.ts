import { canShow, type Tier } from "@/lib/cosmetics";

/**
 * Nameplates: artwork behind your row in other people's Messages list, the
 * way Discord's are. The art sits at the right and fades out to the left,
 * where your name is. Drawn in code (src/components/ui/Nameplate.tsx).
 *
 * Every id here has a row in `products` (migration 0082).
 */
export type NameplateItem = { id: string; label: string; tier: Tier; pricePaise?: number };

export const NAMEPLATES: NameplateItem[] = [
  { id: "plate-lime", label: "Lime Rush", tier: "premium" },
  { id: "plate-petals", label: "Petal Drift", tier: "premium" },
  { id: "plate-starfall", label: "Starfall", tier: "premium" },
  { id: "plate-aurora", label: "Aurora", tier: "premium" },
  { id: "plate-wisp", label: "Will-o'-wisp", tier: "premium" },
  { id: "plate-ember", label: "Ember", tier: "shop", pricePaise: 7900 },
  { id: "plate-sakura", label: "Sakura", tier: "shop", pricePaise: 9900 },
  { id: "plate-city", label: "Neon City", tier: "shop", pricePaise: 9900 },
  { id: "plate-hearts", label: "Pixel Hearts", tier: "shop", pricePaise: 5900 },
  { id: "plate-ocean", label: "Deep Blue", tier: "shop", pricePaise: 7900 },
];

export const findNameplate = (id: string | null | undefined) => NAMEPLATES.find((n) => n.id === id);

/** The nameplate someone may show right now, if any. */
export function visibleNameplate(p: { nameplate?: string | null; is_premium?: boolean | null }): string | null {
  const n = findNameplate(p.nameplate);
  return n && canShow(n.tier, !!p.is_premium) ? n.id : null;
}
