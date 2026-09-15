import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ShopGrid } from "@/components/billing/ShopGrid";
import { razorpayEnv } from "@/lib/billing/razorpay";

export const metadata = { title: "Shop" };

export default async function ShopPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: me }, { data: owned }, { data: products }] = await Promise.all([
    supabase.from("profiles").select("display_name, username, avatar_url, avatar_hue, is_premium").eq("id", user.id).maybeSingle(),
    supabase.from("purchases").select("product_id").eq("user_id", user.id),
    supabase.from("products").select("id, price_paise").eq("tier", "shop").eq("active", true),
  ]);

  return (
    <>
      <PageHeader title="Shop" showBack />
      <ShopGrid
        configured={!!razorpayEnv()}
        isPremium={!!me?.is_premium}
        owned={(owned ?? []).map((o) => o.product_id)}
        prices={Object.fromEntries((products ?? []).map((p) => [p.id, p.price_paise ?? 0]))}
        me={{
          name: me?.display_name ?? me?.username ?? "You",
          avatarUrl: me?.avatar_url ?? null,
          hue: me?.avatar_hue ?? 200,
        }}
      />
    </>
  );
}
