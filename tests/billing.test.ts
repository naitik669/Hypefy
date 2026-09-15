// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { formatInr, isLive, mapRazorpayStatus, PLANS } from "@/lib/billing/plans";
import { hmacValid, orderSignatureValid, periodEnd, subscriptionSignatureValid } from "@/lib/billing/razorpay";
import { planStatusLine, type SubRow } from "@/components/billing/SubscriptionList";

/**
 * Paid plans: prices shown are prices charged, Razorpay's states read the
 * way the database reads them, forged payments are refused, and nothing can
 * be bought inside the Android app.
 */

describe("plans", () => {
  it("prices Verified at ₹99 and Premium at ₹125, with the trial on Premium only", () => {
    expect(formatInr(PLANS.verified.pricePaise)).toBe("₹99");
    expect(formatInr(PLANS.premium.pricePaise)).toBe("₹125");
    expect(PLANS.premium.trial).toBe(true);
    expect(PLANS.verified.trial).toBe(false);
    expect(formatInr(4950)).toBe("₹49.50");
  });

  it("reads a mandate with its first charge still ahead as a free trial", () => {
    const now = Date.UTC(2026, 8, 15);
    const later = now / 1000 + 86400 * 30;
    expect(mapRazorpayStatus("authenticated", later, now)).toBe("trialing");
    expect(mapRazorpayStatus("authenticated", now / 1000 - 10, now)).toBe("active");
    expect(mapRazorpayStatus("created", null, now)).toBe("pending");
    expect(mapRazorpayStatus("pending", null, now)).toBe("past_due");
    expect(mapRazorpayStatus("halted", null, now)).toBe("expired");
    expect(mapRazorpayStatus("cancelled", null, now)).toBe("cancelled");
  });

  it("keeps benefits on while trialing, active or retrying — as the database does", () => {
    expect(["trialing", "active", "past_due"].every(isLive)).toBe(true);
    expect(["pending", "cancelled", "expired"].some(isLive)).toBe(false);
  });
});

describe("payment signatures", () => {
  const secret = "test_secret";

  it("accepts Razorpay's HMAC-SHA256 and refuses anything tampered", async () => {
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", secret).update("pay_1|sub_1").digest("hex");
    expect(subscriptionSignatureValid("pay_1", "sub_1", sig, secret)).toBe(true);
    expect(subscriptionSignatureValid("pay_1", "sub_2", sig, secret)).toBe(false);
    expect(subscriptionSignatureValid("pay_1", "sub_1", sig, "other")).toBe(false);

    const osig = createHmac("sha256", secret).update("order_1|pay_1").digest("hex");
    expect(orderSignatureValid("order_1", "pay_1", osig, secret)).toBe(true);
    // The order is order_id|payment_id — swapped is a different message.
    expect(orderSignatureValid("pay_1", "order_1", osig, secret)).toBe(false);
  });

  it("refuses a missing signature or a missing secret", () => {
    expect(hmacValid("body", null, secret)).toBe(false);
    expect(hmacValid("body", "abc", "")).toBe(false);
    expect(hmacValid("body", "short", secret)).toBe(false);
  });

  it("runs a trial's period to the first charge", () => {
    expect(periodEnd({ id: "s", status: "authenticated", start_at: 1_800_000_000, current_end: null, charge_at: null }))
      .toBe(new Date(1_800_000_000_000).toISOString());
  });
});

describe("the subscription line", () => {
  const base: SubRow = {
    id: "1", plan: "premium", status: "active", provider: "razorpay",
    trial_ends_at: null, current_period_end: "2026-10-15T00:00:00Z", cancel_at_period_end: false,
  };
  it("says when the free trial ends and what comes after", () => {
    const line = planStatusLine(
      { ...base, status: "trialing", trial_ends_at: "2026-10-15T00:00:00Z" },
      Date.UTC(2026, 8, 20),
    );
    expect(line).toContain("Free trial until");
    expect(line).toContain("₹125/month");
  });
  it("says a cancelled plan is yours until the period ends", () => {
    expect(planStatusLine({ ...base, cancel_at_period_end: true })).toContain("yours until");
  });
  it("names a manual grant", () => {
    expect(planStatusLine({ ...base, provider: "manual" })).toBe("Granted by Hypefy");
  });
});

// --- Nothing to buy in the Android app ---------------------------------

const native = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/native", () => ({ isNative: () => native.value }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));

describe("the Premium page", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function render(props: Partial<{ configured: boolean; trialEligible: boolean }>) {
    const { PremiumPlans } = await import("@/components/billing/PremiumPlans");
    await act(async () =>
      root.render(
        createElement(PremiumPlans, {
          configured: true, trialEligible: true, hasPremium: false, hasVerified: false, ...props,
        }),
      ),
    );
    return host.textContent ?? "";
  }

  it("leads with the free trial on the web", async () => {
    native.value = false;
    const text = await render({});
    expect(text).toContain("Start your 7-day free trial");
    expect(text).toContain("then ₹125/month");
    expect(text).toContain("Get Verified");
  });

  it("offers nothing to buy inside the app", async () => {
    native.value = true;
    const text = await render({});
    expect(text).not.toContain("Start your 7-day free trial");
    expect(text).not.toContain("Get Verified");
    expect(text).toContain("isn't available in the app yet");
  });

  it("drops the trial wording once the free trial is used", async () => {
    native.value = false;
    const text = await render({ trialEligible: false });
    expect(text).toContain("Get Premium");
    expect(text).not.toContain("free trial");
  });
});
