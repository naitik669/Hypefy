import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordPurchase } from "@/lib/billing/apply";
import { orderSignatureValid, razorpayEnv, rzp } from "@/lib/billing/razorpay";

export const runtime = "nodejs";

/**
 * POST /api/billing/confirm-order — a Shop checkout finished.
 *
 * Signature first, then the order is read back from Razorpay so its notes —
 * not the browser — say who bought what.
 */
export async function POST(req: NextRequest) {
  const env = razorpayEnv();
  if (!env) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const orderId = String(body?.razorpay_order_id ?? "");
  const paymentId = String(body?.razorpay_payment_id ?? "");
  const signature = String(body?.razorpay_signature ?? "");
  if (!orderSignatureValid(orderId, paymentId, signature, env.keySecret)) {
    return NextResponse.json({ error: "Payment couldn't be verified." }, { status: 400 });
  }

  try {
    const order = await rzp<{ id: string; amount: number; status: string; notes?: Record<string, string> }>(
      env, "GET", `/orders/${orderId}`,
    );
    if (order.notes?.user_id !== user.id) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    const got = await recordPurchase(createAdminClient(), order.id, order.amount, order.notes);
    return NextResponse.json({ productId: got?.productId });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "billing-confirm-order" } });
    return NextResponse.json({ pending: true });
  }
}
