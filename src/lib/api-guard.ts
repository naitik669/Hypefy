import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Guard for the third-party proxy routes (/api/gifs, /api/music, /api/client-error)
 * and for /api/calls/ice, which mints relay credentials.
 *
 * These were previously open to the internet, so anyone could burn the Giphy
 * quota or drain the Sentry allowance. Requires a signed-in user, then applies
 * the sliding-window limiter from supabase/migrations/0026_rate_limiting.sql via
 * the api_rate_limit wrapper — the wrapper holds the limits server-side so a
 * client can't raise its own cap.
 *
 * Returns a NextResponse to short-circuit with, or null when the caller may proceed.
 */
export async function guardApi(action: "gifs" | "music" | "client_error" | "ice"): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Raises check_violation once the window is exceeded.
  const { error } = await supabase.rpc("api_rate_limit", { p_action: action });
  if (error) {
    return NextResponse.json({ error: "Rate limit exceeded, slow down." }, { status: 429 });
  }

  return null;
}

/**
 * Per-IP sliding window for endpoints that must stay reachable while signed
 * out. In-memory, so it is per-instance and resets on deploy — deliberately
 * coarse. It exists to blunt a flood, not to be an exact quota; the callers
 * also size-cap payloads and self-limit client-side.
 */
const ipHits = new Map<string, number[]>();

function callerIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function ipRateLimited(req: Request, limit: number, windowMs: number): boolean {
  const ip = callerIp(req);

  const now = Date.now();
  const recent = (ipHits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  ipHits.set(ip, recent);

  // Opportunistic sweep so the map can't grow without bound.
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) {
      if (v.every((t) => now - t >= windowMs)) ipHits.delete(k);
    }
  }

  return recent.length > limit;
}

/** What the limiter is told instead of the address: the action and the address, hashed. */
export async function attemptKey(action: string, ip: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${action}:${ip}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * May this caller try again? For endpoints where a guess is worth something
 * (the invite code) and nobody is signed in.
 *
 * Counted in the database (ip_rate_limit, migration 0129), so the count is
 * one count however many server instances are answering — the in-memory
 * window above is per instance, and a guesser simply meets a fresh one. That
 * window is still the fallback when the database cannot be asked, so a
 * missing key or an outage loosens the limit rather than locking everyone
 * out of the app's front door.
 */
export async function attemptAllowed(
  req: Request,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return !ipRateLimited(req, limit, windowSeconds * 1000);

  try {
    const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await admin.rpc("ip_rate_limit", {
      p_key: await attemptKey(action, callerIp(req)),
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error || typeof data !== "boolean") return !ipRateLimited(req, limit, windowSeconds * 1000);
    return data;
  } catch {
    return !ipRateLimited(req, limit, windowSeconds * 1000);
  }
}

/**
 * Does a request's secret header match the configured one?
 *
 * Two things the `!==` it replaces got wrong.
 *
 * An unset or empty env var must never be a passing answer. `!==` left a
 * window: with the variable set to the empty string, a caller sending an
 * empty header matched it. A cron secret that has been cleared should fail
 * closed, not open.
 *
 * And the comparison is constant-time. Over the internet a timing oracle on
 * a string compare is a stretch, but these headers guard the two endpoints
 * pg_cron calls — the push fan-out and the one-shot reaper — and the cost of
 * being careful is one function.
 *
 * Lengths are compared first because timingSafeEqual throws on a mismatch;
 * that leaks the length of the secret and nothing else.
 */
export function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!expected) return false;
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The push services a subscription endpoint may point at.
 *
 * `push_subscriptions` rows are written by the client and checked only for
 * `user_id`, and /api/push POSTs to whatever `endpoint` says. Without this
 * an account could register any number of endpoints on any host and have
 * the server fan out to them — a reflector, and a way to tie up functions
 * on slow hosts. The payload is fixed and the scheme is HTTPS, so the reach
 * is limited, but there is no reason to allow it at all.
 */
const PUSH_HOSTS = [
  "android.googleapis.com",
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
];

export function isPushEndpointAllowed(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    return PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(".notify.windows.com"));
  } catch {
    return false;
  }
}
