import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { MarketCategory } from "@/components/billing/MarketCategory";
import { categoryPage } from "@/lib/marketplace";
import { loadMarketplace } from "../load";

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const page = categoryPage((await params).category);
  return { title: page ? page.label : "Marketplace" };
}

export default async function MarketCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const page = categoryPage((await params).category);
  if (!page) notFound();
  const data = await loadMarketplace();
  return (
    <>
      <PageHeader title={page.label} showBack />
      <MarketCategory page={page} {...data} />
    </>
  );
}
