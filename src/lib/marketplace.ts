import { DECORATIONS, NAME_FONTS, NAME_GLOWS, PREMIUM_BANNERS, type Tier } from "@/lib/cosmetics";
import { CHAT_THEMES } from "@/lib/chat-themes";
import { BUBBLE_STYLES } from "@/lib/bubble-styles";

/**
 * Everything the Marketplace lists, in one shape, with the filter and sort
 * rules kept here as plain functions so they can be tested without a page.
 * Free chat themes aren't listed: there is nothing to get.
 */

export type Category = "frame" | "bubble" | "theme" | "name" | "banner";

export type MarketItem = {
  id: string;
  label: string;
  category: Category;
  tier: Tier;
  /** Catalogue price in paise, for Shop items. */
  pricePaise?: number;
  /** Position in the curated order. */
  rank: number;
};

export const CATEGORIES: { id: Category | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "frame", label: "Frames" },
  { id: "bubble", label: "Bubbles" },
  { id: "theme", label: "Chat themes" },
  { id: "name", label: "Names" },
  { id: "banner", label: "Banners" },
];

export type SortId = "featured" | "price-low" | "price-high" | "premium";

export const SORTS: { id: SortId; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "price-low", label: "Price: low to high" },
  { id: "price-high", label: "Price: high to low" },
  { id: "premium", label: "Premium first" },
];

export function buildItems(prices: Record<string, number> = {}): MarketItem[] {
  let rank = 0;
  const item = (id: string, label: string, category: Category, tier: Tier): MarketItem => ({
    id,
    label,
    category,
    tier,
    ...(tier === "shop" && prices[id] ? { pricePaise: prices[id] } : {}),
    rank: rank++,
  });
  // Curated order for "Featured": the most visual things first.
  return [
    ...CHAT_THEMES.filter((t) => t.tier !== "free").map((t) => item(t.id, t.label, "theme", t.tier)),
    ...DECORATIONS.map((d) => item(d.id, d.label, "frame", d.tier)),
    ...BUBBLE_STYLES.map((b) => item(b.id, b.label, "bubble", b.tier)),
    ...NAME_FONTS.map((f) => item(f.id, f.label, "name", f.tier)),
    ...NAME_GLOWS.map((g) => item(g.id, `${g.label} glow`, "name", g.tier)),
    ...PREMIUM_BANNERS.map((b) => item(b.id, b.label, "banner", b.tier)),
  ];
}

export function filterAndSort(items: MarketItem[], category: Category | "all", sort: SortId): MarketItem[] {
  const list = category === "all" ? [...items] : items.filter((i) => i.category === category);
  const price = (i: MarketItem) => i.pricePaise ?? null;
  switch (sort) {
    case "price-low":
    case "price-high": {
      const dir = sort === "price-low" ? 1 : -1;
      // Priced items in price order; Premium items after them, in curated order.
      return list.sort((a, b) => {
        const pa = price(a);
        const pb = price(b);
        if (pa !== null && pb !== null) return (pa - pb) * dir || a.rank - b.rank;
        if (pa !== null) return -1;
        if (pb !== null) return 1;
        return a.rank - b.rank;
      });
    }
    case "premium":
      return list.sort((a, b) => Number(b.tier === "premium") - Number(a.tier === "premium") || a.rank - b.rank);
    default:
      return list.sort((a, b) => a.rank - b.rank);
  }
}

/** Is it already yours? */
export function isOwned(item: MarketItem, owned: string[], isPremium: boolean): boolean {
  if (item.tier === "free") return true;
  return item.tier === "premium" ? isPremium : owned.includes(item.id);
}
