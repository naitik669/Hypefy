import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlanId } from "@/lib/billing/plans";

/**
 * Razorpay, server side. Plain REST with basic auth — the SDK would add a
 * dependency for four calls.
 *
 * Everything here is off until the keys exist: `razorpayEnv()` returns null
 * and the routes answer 503, which the page shows as "Coming soon".
 */

const API = "https://api.razorpay.com/v1";

export type RazorpayEnv = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  plans: Record<PlanId, string>;
};

export function razorpayEnv(): RazorpayEnv | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const verified = process.env.RAZORPAY_PLAN_VERIFIED;
  const premium = process.env.RAZORPAY_PLAN_PREMIUM;
  if (!keyId || !keySecret || !verified || !premium) return null;
  return {
    keyId,
    keySecret,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
    plans: { verified, premium },
  };
}

export async function rzp<T = Record<string, unknown>>(
  env: RazorpayEnv,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.keyId}:${env.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) {
    throw new Error(`razorpay ${method} ${path}: ${res.status} ${json?.error?.description ?? ""}`.trim());
  }
  return json;
}

/** Constant-time HMAC-SHA256 check of a hex signature. */
export function hmacValid(payload: string, signature: string | null | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout's proof for a subscription: HMAC(payment_id|subscription_id). */
export function subscriptionSignatureValid(
  paymentId: string,
  subscriptionId: string,
  signature: string,
  secret: string,
): boolean {
  return hmacValid(`${paymentId}|${subscriptionId}`, signature, secret);
}

/** Checkout's proof for a one-off order: HMAC(order_id|payment_id). */
export function orderSignatureValid(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  return hmacValid(`${orderId}|${paymentId}`, signature, secret);
}

export type RzpSubscription = {
  id: string;
  status: string;
  start_at: number | null;
  current_end: number | null;
  charge_at: number | null;
  notes?: Record<string, string>;
};

const iso = (sec: number | null | undefined) => (sec ? new Date(sec * 1000).toISOString() : null);

/**
 * The period a Razorpay subscription has paid (or trialled) up to. During a
 * trial there is no current_end yet: the free trial runs to the first charge.
 */
export function periodEnd(sub: RzpSubscription): string | null {
  return iso(sub.current_end) ?? iso(sub.start_at);
}
