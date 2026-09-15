import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRazorpaySubscription, recordPurchase } from "@/lib/billing/apply";
import { hmacValid, razorpayEnv, type RzpSubscription } from "@/lib/billing/razorpay";

export const runtime = "nodejs";

/**
 * POST /api/billing/webhook — Razorpay telling us what happened.
 *
 * The source of truth for renewals, failed payments and cancellations, and
 * the backstop for a checkout whose browser closed before confirming.
 *
 * The signature covers the raw body, so the body is read as text and only
 * parsed after it checks out. Every event id is recorded first: Razorpay
 * retries, and a replay must do nothing.
 */
export async function POST(req: NextRequest) {
  const env = razorpayEnv();
  if (!env || !env.webhookSecret) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (!hmacValid(raw, req.headers.get("x-razorpay-signature"), env.webhookSecret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let event: {
    event?: string;
    payload?: {
      subscription?: { entity?: RzpSubscription };
      payment?: { entity?: { id?: string; order_id?: string; amount?: number; notes?: Record<string, string> } };
      order?: { entity?: { id?: string; amount?: number; notes?: Record<string, string> } };
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const type = event.event ?? "unknown";
  const admin = createAdminClient();

  const eventId = req.headers.get("x-razorpay-event-id");
  if (eventId) {
    const { error } = await admin.from("billing_events").insert({ event_id: eventId, type });
    // Unique violation: seen it already.
    if (error?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const sub = event.payload?.subscription?.entity;
    if (type.startsWith("subscription.") && sub?.id) {
      await applyRazorpaySubscription(admin, sub);
    }

    if (type === "order.paid") {
      const order = event.payload?.order?.entity;
      if (order?.id) await recordPurchase(admin, order.id, order.amount ?? null, order.notes);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "billing-webhook" }, extra: { type } });
    // Let Razorpay retry: forget the event id so the retry is not a "duplicate".
    if (eventId) await admin.from("billing_events").delete().eq("event_id", eventId);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
