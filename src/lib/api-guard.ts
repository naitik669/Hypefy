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
