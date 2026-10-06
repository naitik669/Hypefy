import { DECORATIONS, NAME_FONTS, NAME_GLOWS, type Tier } from "@/lib/cosmetics";
import { NAMEPLATES } from "@/lib/nameplates";
import { CHAT_THEMES } from "@/lib/chat-themes";
import { BUBBLE_STYLES } from "@/lib/bubble-styles";

/**
 * Everything the Marketplace lists, in one shape, with the filter and sort
 * rules kept here as plain functions so they can be tested without a page.
 * Free chat themes aren't listed: there is nothing to get.
 */

export type Category = "frame" | "bubble" | "theme" | "name" | "nameplate";

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

export type SortId = "featured" | "price-low" | "price-high" | "premium";

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
    ...NAMEPLATES.map((n) => item(n.id, n.label, "nameplate", n.tier)),
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
  return unlocked(item.tier, item.id, owned, isPremium);
}

/**
 * Whether someone may use an item. Mirrors owns_product (0090): free is
 * everyone's; Premium unlocks Premium items AND the Shop; a Shop item bought
 * outright stays yours without Premium.
 */
export function unlocked(tier: "free" | "premium" | "shop", id: string, owned: string[], isPremium: boolean): boolean {
  if (tier === "free") return true;
  if (tier === "premium") return isPremium;
  return isPremium || owned.includes(id);
}

/**
 * The Marketplace as places: a home with one card per category, and a page
 * for each. The slug is what the address says (/marketplace/frames).
 *
 * `showcase` is the item the home shows large for the category — one real
 * thing from it, since a card with an icon says less than the thing itself.
 * `columns` is how the category's own page lays out: small square things
 * three across, wide things two.
 */
export type CategoryPage = {
  slug: string;
  category: Category;
  label: string;
  showcase: string;
  columns: 2 | 3;
};

export const CATEGORY_PAGES: CategoryPage[] = [
  { slug: "frames", category: "frame", label: "Frames", showcase: "deco-crown", columns: 3 },
  { slug: "bubbles", category: "bubble", label: "Chat bubbles", showcase: "bubble-sunset", columns: 2 },
  { slug: "names", category: "name", label: "Names", showcase: "font-script", columns: 3 },
  { slug: "nameplates", category: "nameplate", label: "Nameplates", showcase: "plate-aurora", columns: 2 },
  { slug: "themes", category: "theme", label: "Chat themes", showcase: "theme-arcade", columns: 2 },
];

export const categoryPage = (slug: string): CategoryPage | undefined =>
  CATEGORY_PAGES.find((c) => c.slug === slug);

/** The item a category shows on the home: its showcase, or its first if that has gone. */
export function showcaseOf(page: CategoryPage, items: MarketItem[]): MarketItem | undefined {
  const mine = items.filter((i) => i.category === page.category);
  return mine.find((i) => i.id === page.showcase) ?? mine[0];
}

/**
 * What the button on an item does, and says.
 *
 *   wear     it is already yours: go and put it on
 *   premium  it comes with Premium, which you do not have: go and see Premium
 *   buy      it has a price and can be bought here
 *   blocked  it cannot be bought here: the Android app (Play's rules), or no
 *            price has been set yet
 *
 * One function, so the tile's small button and the preview's large one can
 * never disagree about what happens when you tap.
 */
export type ItemAction =
  | { kind: "wear"; href: string }
  | { kind: "premium"; href: string }
  | { kind: "buy"; pricePaise: number }
  | { kind: "blocked"; why: "app" | "soon" };

export function itemAction(
  item: MarketItem,
  ctx: { owned: boolean; native: boolean },
): ItemAction {
  if (ctx.owned) {
    return { kind: "wear", href: item.category === "theme" ? "/messages" : `/settings/style?wear=${encodeURIComponent(item.id)}` };
  }
  if (item.tier === "premium") return { kind: "premium", href: "/premium" };
  if (ctx.native) return { kind: "blocked", why: "app" };
  if (!item.pricePaise) return { kind: "blocked", why: "soon" };
  return { kind: "buy", pricePaise: item.pricePaise };
}

/**
 * Where an item can be seen once it is yours, for the preview's switch. Only
 * places it really appears: a nameplate lives in the messages list and
 * nowhere else, so it gets one place and no switch.
 */
export type Place = "profile" | "chat" | "feed" | "inbox";

export function placesFor(category: Category): Place[] {
  switch (category) {
    case "frame":
      return ["profile", "chat"];
    case "name":
      return ["profile", "feed"];
    case "nameplate":
      return ["inbox"];
    default:
      return ["chat"];
  }
}

export const PLACE_LABEL: Record<Place, string> = {
  profile: "Profile",
  chat: "In chat",
  feed: "In feed",
  inbox: "Messages",
};

/**
 * The items either side of this one, for the row under the preview: two
 * before, itself, two after, wrapping round, so there is always something to
 * flick to. Fewer than five in a category gives each of them once.
 */
export function neighbours<T>(list: T[], index: number, reach = 2): T[] {
  const n = list.length;
  if (n === 0) return [];
  if (n <= reach * 2 + 1) return list;
  const out: T[] = [];
  for (let o = -reach; o <= reach; o++) out.push(list[(((index + o) % n) + n) % n]);
  return out;
}
