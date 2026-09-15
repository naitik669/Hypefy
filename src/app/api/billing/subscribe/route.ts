import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLive, isPlanId, TRIAL_DAYS } from "@/lib/billing/plans";
import { razorpayEnv, rzp, type RzpSubscription } from "@/lib/billing/razorpay";

export const runtime = "nodejs";

/**
 * POST /api/billing/subscribe { plan }
 *
 * Opens a Razorpay subscription for checkout to complete. Premium starts a
 * week from now when this person has never had a free trial, so the first
 * charge waits for the trial; checkout only verifies the card or UPI mandate.
 * Nothing is granted here — a pending row is not a plan.
 */
export async function POST(req: NextRequest) {
  const env = razorpayEnv();
  if (!env) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const plan = body?.plan;
  if (!isPlanId(plan)) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", user.id);
  const live = (subs ?? []).filter((s) => isLive(s.status));
  if (live.some((s) => s.plan === "premium")) {
    return NextResponse.json({ error: "You already have Premium." }, { status: 409 });
  }
  if (plan === "verified" && live.some((s) => s.plan === "verified")) {
    return NextResponse.json({ error: "You're already verified." }, { status: 409 });
  }

  let trial = false;
  if (plan === "premium") {
    const { data } = await admin.rpc("trial_eligible", { p_uid: user.id });
    trial = data === true;
  }

  try {
    const sub = await rzp<RzpSubscription>(env, "POST", "/subscriptions", {
      plan_id: env.plans[plan],
      // Ten years of monthly cycles: Razorpay needs an end, and this is "until cancelled".
      total_count: 120,
      customer_notify: 1,
      ...(trial ? { start_at: Math.floor(Date.now() / 1000) + TRIAL_DAYS * 86400 } : {}),
      notes: { user_id: user.id, plan },
    });

    const { error } = await admin.from("subscriptions").insert({
      user_id: user.id,
      plan,
      status: "pending",
      provider: "razorpay",
      provider_ref: sub.id,
    });
    if (error) throw error;

    return NextResponse.json({ keyId: env.keyId, subscriptionId: sub.id, trial });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "billing-subscribe" } });
    return NextResponse.json({ error: "Couldn't start checkout. Try again." }, { status: 502 });
  }
}
