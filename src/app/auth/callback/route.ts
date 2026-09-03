import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Only same-site, absolute paths may be forwarded to.
 *
 * `next` arrives from a link in an email, so it is attacker-controllable in
 * practice. Anything that could leave the origin — a full URL, a scheme, a
 * protocol-relative "//host", or the "/\host" that some engines normalise
 * into one — falls back to "/". Password recovery is the flow that made
 * this parameter load-bearing, and recovery links are exactly what gets
 * forwarded to a victim.
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

// Handles the redirect back from Google OAuth, email confirmation links, and
// password recovery. Exchanges the auth code for a session, then forwards
// into the app — recovery sends `next=/reset-password` so the person lands
// on a screen that can actually change the password.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Default to "/" so the smart router decides onboarding/setup/home.
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // In production we sit behind a proxy (Vercel), so `origin` can be the
      // internal host. Prefer the forwarded host to redirect to the real URL.
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (!isLocalEnv && forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/signin?error=auth_failed`);
}
