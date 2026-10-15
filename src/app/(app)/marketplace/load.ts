import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { razorpayEnv } from "@/lib/billing/razorpay";
import type { Me } from "@/components/billing/MarketItemPreview";
import type { Worn } from "@/lib/marketplace";
import { loadFrames } from "@/lib/frames-load";
import type { Tier } from "@/lib/cosmetics";

/**
 * What every Marketplace page needs: who you are, what you already own, and
 * what things cost. One place, so the home and a category's page cannot
 * disagree about either.
 */
export async function loadMarketplace(): Promise<{
  configured: boolean;
  isPremium: boolean;
  owned: string[];
  prices: Record<string, number>;
  me: Me;
  /** Your id, and what you have on, so an item can be worn from here. */
  userId: string;
  worn: Worn;
  /** Frames that came from the uploader. The code catalogue has only Bolt. */
  uploadedFrames: { id: string; label: string; tier: Tier }[];
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: me }, { data: owned }, { data: products }, frames] = await Promise.all([
    supabase.from("profiles").select("display_name, username, avatar_url, avatar_hue, is_premium, avatar_decoration, name_font, name_glow, bubble_style, nameplate").eq("id", user.id).maybeSingle(),
    supabase.from("purchases").select("product_id").eq("user_id", user.id),
    supabase.from("products").select("id, price_paise").eq("tier", "shop").eq("active", true),
    loadFrames(),
  ]);

  return {
    configured: !!razorpayEnv(),
    isPremium: !!me?.is_premium,
    owned: (owned ?? []).map((o) => o.product_id),
    prices: Object.fromEntries((products ?? []).map((p) => [p.id, p.price_paise ?? 0])),
    userId: user.id,
    // Only the uploaded ones: the code-drawn frames are already in
    // DECORATIONS, and listing a frame twice is worse than not at all.
    uploadedFrames: Object.values(frames)
      .filter((f) => f.url)
      .map((f) => ({ id: f.id, label: f.label, tier: f.tier })),
    worn: {
      avatar_decoration: me?.avatar_decoration ?? null,
      name_font: me?.name_font ?? null,
      name_glow: me?.name_glow ?? null,
      bubble_style: me?.bubble_style ?? null,
      nameplate: me?.nameplate ?? null,
    },
    me: {
      name: me?.display_name ?? me?.username ?? "You",
      username: me?.username ?? null,
      avatarUrl: me?.avatar_url ?? null,
      hue: me?.avatar_hue ?? 200,
    },
  };
}
