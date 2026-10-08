import { PageHeader } from "@/components/ui/PageHeader";
import { MarketBrowse } from "@/components/billing/MarketBrowse";
import { buildItems } from "@/lib/marketplace";
import { loadMarketplace } from "./load";

export const metadata = { title: "Marketplace" };

/**
 * The Marketplace, opened.
 *
 * It used to open on five cards, one per kind, so finding a thing meant
 * guessing which kind it was first. It opens on the things themselves now,
 * with a search box and four shelves — everything, free, Premium, and what
 * is already yours. The kinds are still here, at the foot, for browsing
 * rather than as the only way in.
 *
 * Two across rather than three: the grid mixes kinds, and a nameplate is two
 * rows of writing that a third of the screen crops to nothing.
 */
export default async function MarketplacePage() {
  const data = await loadMarketplace();
  return (
    <>
      <PageHeader title="Marketplace" showBack />
      <MarketBrowse items={buildItems(data.prices)} columns={2} browse {...data} />
    </>
  );
}
