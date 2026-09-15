import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRazorpaySubscription } from "@/lib/billing/apply";
import { razorpayEnv, rzp, subscriptionSignatureValid, type RzpSubscription } from "@/lib/billing/razorpay";

export const runtime = "nodejs";

/**
 * POST /api/billing/confirm — checkout finished.
 *
 * The signature proves checkout really completed this subscription; the
 * state itself is read back from Razorpay rather than taken from the
 * browser. Granting here, instead of waiting for the webhook, is what makes
 * the badge appear the moment the sheet closes.
 */
export async function POST(req: NextRequest) {
  const env = razorpayEnv();
  if (!env) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const paymentId = String(body?.razorpay_payment_id ?? "");
  const subscriptionId = String(body?.razorpay_subscription_id ?? "");
  const signature = String(body?.razorpay_signature ?? "");
  if (!subscriptionSignatureValid(paymentId, subscriptionId, signature, env.keySecret)) {
    return NextResponse.json({ error: "Payment couldn't be verified." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("subscriptions")
    .select("id, user_id, plan")
    .eq("provider", "razorpay")
    .eq("provider_ref", subscriptionId)
    .maybeSingle();
  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }

  try {
    const sub = await rzp<RzpSubscription>(env, "GET", `/subscriptions/${subscriptionId}`);

    // Two checkouts opened side by side could each carry a free trial. The
    // first to finish keeps it; any other is cancelled before it counts.
    const trialing = sub.status === "authenticated" && !!sub.start_at && sub.start_at * 1000 > Date.now();
    if (row.plan === "premium" && trialing) {
      const { data: other } = await admin
        .from("subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("plan", "premium")
        .not("trial_ends_at", "is", null)
        .neq("id", row.id)
        .limit(1);
      if (other?.length) {
        await rzp(env, "POST", `/subscriptions/${subscriptionId}/cancel`, { cancel_at_cycle_end: 0 }).catch(() => {});
        await admin.from("subscriptions").update({ status: "expired" }).eq("id", row.id);
        return NextResponse.json({ error: "You've already used your free trial." }, { status: 409 });
      }
    }

    const applied = await applyRazorpaySubscription(admin, sub);
    return NextResponse.json({ plan: applied?.plan, status: applied?.status });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "billing-confirm" } });
    // The webhook will still land it; say so rather than "failed".
    return NextResponse.json({ pending: true });
  }
}
