import { PageHeader } from "@/components/ui/PageHeader";
import { MarketHome } from "@/components/billing/MarketHome";
import { loadMarketplace } from "./load";

export const metadata = { title: "Marketplace" };

export default async function MarketplacePage() {
  const { prices, me } = await loadMarketplace();
  return (
    <>
      <PageHeader title="Marketplace" showBack />
      <MarketHome prices={prices} me={me} />
    </>
  );
}
