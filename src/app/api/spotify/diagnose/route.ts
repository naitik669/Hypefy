import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirectUri, spotifyEnv } from "@/lib/spotify";

export const runtime = "nodejs";

/**
 * GET /api/spotify/diagnose — why is Spotify not working here?
 *
 * Reports whether each piece of configuration is *present* and what redirect
 * URI this deployment will send. It never returns a client secret, an access
 * token, or a refresh token — only booleans, lengths, and the redirect URI,
 * which is public by construction because it is handed to Spotify in a query
 * string anyway.
 *
 * Auth-gated so it cannot be used to fingerprint the deployment anonymously.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const { clientId, clientSecret } = spotifyEnv();
  const willSend = redirectUri(req.nextUrl.origin);

  let connection: Record<string, unknown> = { connected: false };
  try {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { data } = await admin
      .from("spotify_accounts")
      .select("product, scope, expires_at, display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      connection = {
        connected: true,
        product: data.product,
        isPremium: data.product === "premium",
        scope: data.scope,
        accessTokenExpired: new Date(data.expires_at).getTime() <= Date.now(),
        displayName: data.display_name,
      };
    }
  } catch (err) {
    connection = { connected: false, lookupError: String(err).slice(0, 160) };
  }

  return NextResponse.json({
    env: {
      SPOTIFY_CLIENT_ID: clientId ? `set (${clientId.length} chars)` : "MISSING",
      SPOTIFY_CLIENT_SECRET: clientSecret ? `set (${clientSecret.length} chars)` : "MISSING",
      SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI || "not set (falling back to origin)",
    },
    // Must match a Redirect URI in the Spotify dashboard character for
    // character, or consent fails with "redirect_uri: Not matching".
    redirectUriThisDeploymentSends: willSend,
    origin: req.nextUrl.origin,
    connection,
  });
}
