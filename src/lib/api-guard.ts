import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Guard for the third-party proxy routes (/api/gifs, /api/music, /api/client-error).
 *
 * These were previously open to the internet, so anyone could burn the Giphy
 * quota or drain the Sentry allowance. Requires a signed-in user, then applies
 * the sliding-window limiter from supabase/migrations/0026_rate_limiting.sql via
 * the api_rate_limit wrapper — the wrapper holds the limits server-side so a
 * client can't raise its own cap.
 *
 * Returns a NextResponse to short-circuit with, or null when the caller may proceed.
 */
export async function guardApi(action: "gifs" | "music" | "client_error"): Promise<NextResponse | null> {
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

export function ipRateLimited(req: Request, limit: number, windowMs: number): boolean {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

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
