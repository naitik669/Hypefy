"use client";

/**
 * Razorpay Checkout in the browser: load the script once, open the sheet,
 * and hand what it returns to our confirm route.
 *
 * Nothing about the person goes into the checkout options — Razorpay asks
 * for the contact details it needs itself.
 */

const SRC = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayResponse = Record<string, string>;
type RazorpayInstance = { open: () => void; on: (event: string, cb: (e: unknown) => void) => void };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    const el = existing ?? document.createElement("script");
    el.addEventListener("load", () => resolve(), { once: true });
    el.addEventListener("error", () => reject(new Error("checkout failed to load")), { once: true });
    if (!existing) {
      el.src = SRC;
      el.async = true;
      document.body.appendChild(el);
    }
  });
}

export type CheckoutResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; reason: "dismissed" | "failed" | "not_configured"; message?: string };

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function openSheet(options: Record<string, unknown>): Promise<RazorpayResponse | null> {
  return new Promise((resolve) => {
    const rz = new window.Razorpay!({
      ...options,
      name: "Hypefy",
      theme: { color: "#a3e635" },
      handler: (r: RazorpayResponse) => resolve(r),
      modal: { ondismiss: () => resolve(null) },
    });
    rz.on("payment.failed", () => {
      /* checkout shows the failure and lets them retry inside the sheet */
    });
    rz.open();
  });
}

async function run(
  start: { url: string; body: unknown },
  sheet: (started: Record<string, unknown>) => Record<string, unknown>,
  confirmUrl: string,
): Promise<CheckoutResult> {
  const { res, json } = await post(start.url, start.body);
  if (res.status === 503) return { ok: false, reason: "not_configured" };
  if (!res.ok) return { ok: false, reason: "failed", message: String(json.error ?? "Something went wrong.") };

  try {
    await loadScript();
  } catch {
    return { ok: false, reason: "failed", message: "Checkout couldn't load. Check your connection." };
  }

  const paid = await openSheet({ key: json.keyId, ...sheet(json) });
  if (!paid) return { ok: false, reason: "dismissed" };

  const confirm = await post(confirmUrl, paid);
  if (!confirm.res.ok) {
    return { ok: false, reason: "failed", message: String(confirm.json.error ?? "Payment couldn't be confirmed.") };
  }
  return { ok: true, data: confirm.json };
}

export function subscribe(plan: "verified" | "premium", description: string) {
  return run(
    { url: "/api/billing/subscribe", body: { plan } },
    (s) => ({ subscription_id: s.subscriptionId, description }),
    "/api/billing/confirm",
  );
}

export function buyItem(productId: string) {
  return run(
    { url: "/api/billing/order", body: { productId } },
    (s) => ({ order_id: s.orderId, amount: s.amount, currency: "INR", description: String(s.name ?? "") }),
    "/api/billing/confirm-order",
  );
}
