import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { MarketBrowse } from "@/components/billing/MarketBrowse";
import { buildItems, categoryPage } from "@/lib/marketplace";
import { loadMarketplace } from "../load";

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const page = categoryPage((await params).category);
  return { title: page ? page.label : "Marketplace" };
}

export default async function MarketCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const page = categoryPage((await params).category);
  if (!page) notFound();
  const data = await loadMarketplace();
  const items = buildItems(data.prices).filter((i) => i.category === page.category);
  return (
    <>
      <PageHeader title={page.label} showBack />
      <MarketBrowse items={items} columns={page.columns} {...data} />
    </>
  );
}
