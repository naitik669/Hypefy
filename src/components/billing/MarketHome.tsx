import Link from "next/link";
import { MarketItemPreview, type Me } from "@/components/billing/MarketItemPreview";
import { CATEGORY_PAGES, buildItems, showcaseOf } from "@/lib/marketplace";

/**
 * The Marketplace's front page: one tall card per category, down the screen.
 *
 * Each card is a real item from the category, shown large on you, with the
 * category named under it. An icon and a word would say "frames"; your own
 * photo in a crown says what a frame is.
 */
export function MarketHome({ prices, me }: { prices: Record<string, number>; me: Me }) {
  const items = buildItems(prices);
  return (
    <ul className="flex flex-col gap-3 px-3 pb-24 pt-3">
      {CATEGORY_PAGES.map((page) => {
        const show = showcaseOf(page, items);
        const count = items.filter((i) => i.category === page.category).length;
        if (!show) return null;
        return (
          <li key={page.slug}>
            <Link
              href={`/marketplace/${page.slug}`}
              className="block overflow-hidden rounded-3xl bg-surface transition-transform active:scale-[0.985]"
            >
              <span className="block h-40" aria-hidden>
                <MarketItemPreview item={show} me={me} large />
              </span>
              <span className="flex items-baseline justify-between gap-3 px-4 py-3">
                <span className="text-base font-extrabold">{page.label}</span>
                <span className="text-xs text-muted">{count} to pick from</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
