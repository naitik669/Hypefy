import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { razorpayEnv, rzp } from "@/lib/billing/razorpay";

export const runtime = "nodejs";

/**
 * POST /api/billing/order { productId } — buy one Shop item.
 *
 * The price comes from the catalogue, never from the request, and who is
 * buying what is written into the order's notes, which is what the payment
 * is later matched against.
 */
export async function POST(req: NextRequest) {
  const env = razorpayEnv();
  if (!env) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const productId = String(body?.productId ?? "");

  const admin = createAdminClient();
  const { data: product } = await admin
    .from("products")
    .select("id, name, tier, price_paise, active")
    .eq("id", productId)
    .maybeSingle();
  if (!product || !product.active || product.tier !== "shop" || !product.price_paise) {
    return NextResponse.json({ error: "That item isn't for sale." }, { status: 404 });
  }

  const { data: owned } = await admin
    .from("purchases")
    .select("id")
    .eq("user_id", user.id)
    .eq("product_id", product.id)
    .maybeSingle();
  if (owned) return NextResponse.json({ error: "You already own this." }, { status: 409 });

  try {
    const order = await rzp<{ id: string; amount: number }>(env, "POST", "/orders", {
      amount: product.price_paise,
      currency: "INR",
      receipt: `shop_${Date.now()}`,
      notes: { user_id: user.id, product_id: product.id },
    });
    return NextResponse.json({ keyId: env.keyId, orderId: order.id, amount: order.amount, name: product.name });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "billing-order" } });
    return NextResponse.json({ error: "Couldn't start checkout. Try again." }, { status: 502 });
  }
}
