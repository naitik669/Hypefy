import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLive } from "@/lib/billing/plans";
import { razorpayEnv, rzp } from "@/lib/billing/razorpay";

export const runtime = "nodejs";

/**
 * POST /api/billing/cancel { id } — stop renewing.
 *
 * You keep everything until the end of what you've paid for (or the end of
 * the free trial). During a trial Razorpay has nothing to wait for, so the
 * mandate is cancelled at once — no charge can ever happen — while our row
 * stays live to the trial's end.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("subscriptions")
    .select("id, user_id, status, provider, provider_ref")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.user_id !== user.id || !isLive(row.status)) {
    return NextResponse.json({ error: "Nothing to cancel." }, { status: 404 });
  }
  if (row.provider !== "razorpay" || !row.provider_ref) {
    return NextResponse.json({ error: "This plan is managed elsewhere." }, { status: 400 });
  }

  const env = razorpayEnv();
  if (!env) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  try {
    await rzp(env, "POST", `/subscriptions/${row.provider_ref}/cancel`, {
      cancel_at_cycle_end: row.status === "trialing" ? 0 : 1,
    });
    await admin.from("subscriptions").update({ cancel_at_period_end: true }).eq("id", row.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "billing-cancel" } });
    return NextResponse.json({ error: "Couldn't cancel. Try again." }, { status: 502 });
  }
}
