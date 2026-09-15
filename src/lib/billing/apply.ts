import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isLive, mapRazorpayStatus } from "@/lib/billing/plans";
import { periodEnd, type RzpSubscription } from "@/lib/billing/razorpay";

type Admin = SupabaseClient<Database>;

/**
 * Bring our copy of a Razorpay subscription up to date. Used by checkout's
 * confirm step and by the webhook, so the two can arrive in either order, or
 * twice, and land on the same row.
 *
 * Returns the row's plan and new status, or null when we have no such row.
 */
export async function applyRazorpaySubscription(
  admin: Admin,
  sub: RzpSubscription,
): Promise<{ plan: string; status: string; userId: string } | null> {
  const { data: row } = await admin
    .from("subscriptions")
    .select("id, user_id, plan, status, trial_ends_at, current_period_end")
    .eq("provider", "razorpay")
    .eq("provider_ref", sub.id)
    .maybeSingle();
  if (!row) return null;

  let status: string = mapRazorpayStatus(sub.status, sub.start_at);
  const end = periodEnd(sub) ?? row.current_period_end;
  const patch: Database["public"]["Tables"]["subscriptions"]["Update"] = {
    status,
    current_period_end: end,
  };

  if (status === "trialing" && !row.trial_ends_at && sub.start_at) {
    patch.trial_ends_at = new Date(sub.start_at * 1000).toISOString();
  }

  // Cancelled, but already paid (or trialled) to a date still ahead: the
  // benefits last until then, and the nightly expiry job ends them after.
  if (status === "cancelled" && end && new Date(end).getTime() > Date.now()) {
    status = isLive(row.status) ? row.status : "active";
    patch.status = status;
    patch.cancel_at_period_end = true;
  }

  await admin.from("subscriptions").update(patch).eq("id", row.id);
  return { plan: row.plan, status, userId: row.user_id };
}

/**
 * A Shop order was paid: the item is yours. Who bought what travels in the
 * order's notes, which we wrote when creating it — never in anything the
 * browser sends. Idempotent: owning it twice is owning it.
 */
export async function recordPurchase(
  admin: Admin,
  orderId: string,
  amountPaise: number | null,
  notes: Record<string, string> | undefined,
): Promise<{ userId: string; productId: string } | null> {
  const userId = notes?.user_id;
  const productId = notes?.product_id;
  if (!userId || !productId) return null;
  const { error } = await admin.from("purchases").upsert(
    { user_id: userId, product_id: productId, provider: "razorpay", provider_ref: orderId, amount_paise: amountPaise },
    { onConflict: "user_id,product_id", ignoreDuplicates: true },
  );
  if (error) throw error;
  return { userId, productId };
}
