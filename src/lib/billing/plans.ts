/**
 * The two plans, in one place: what the page shows is what the server
 * charges. Razorpay holds the real plan (its id comes from the environment);
 * these prices must match the plans created there.
 */

export type PlanId = "verified" | "premium";

export const TRIAL_DAYS = 30;

export const PLANS: Record<PlanId, { name: string; pricePaise: number; trial: boolean }> = {
  verified: { name: "Verified", pricePaise: 9900, trial: false },
  premium: { name: "Hypefy Premium", pricePaise: 12500, trial: true },
};

export function isPlanId(v: unknown): v is PlanId {
  return v === "verified" || v === "premium";
}

/** ₹99, ₹125, ₹49.50 — whole rupees without the paise. */
export function formatInr(paise: number): string {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}

/** What Premium gives you, in the order the page lists it. */
export const PREMIUM_PERKS = [
  { title: "Verified badge", sub: "The blue star next to your name, everywhere" },
  { title: "Your name, your font", sub: "Six name styles and a glow in your colour" },
  { title: "Avatar decorations", sub: "Frames that sit around your photo" },
  { title: "Premium chat themes", sub: "Pond, Sakura, Galaxy, Sunset — both of you see them" },
  { title: "Profile themes", sub: "Banners you can't get anywhere else" },
  { title: "Custom app icon", sub: "Coming with the next app update" },
] as const;

export type SubStatus = "pending" | "trialing" | "active" | "past_due" | "cancelled" | "expired";

/**
 * Razorpay's subscription state → ours.
 *
 * `authenticated` means the mandate is set up and the first charge is still
 * ahead, which for us is exactly a free trial. `halted` means every retry of
 * a failed charge has failed: the plan is over.
 */
export function mapRazorpayStatus(status: string, startAtSec: number | null, nowMs = Date.now()): SubStatus {
  switch (status) {
    case "created":
      return "pending";
    case "authenticated":
      return startAtSec && startAtSec * 1000 > nowMs ? "trialing" : "active";
    case "active":
      return "active";
    case "pending":
      return "past_due";
    case "cancelled":
      return "cancelled";
    case "halted":
    case "completed":
    case "expired":
      return "expired";
    default:
      return "pending";
  }
}

/** Statuses during which the plan's benefits are on. Mirrors sync_entitlements(). */
export function isLive(status: string): boolean {
  return status === "trialing" || status === "active" || status === "past_due";
}
