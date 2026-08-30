import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { exchangeCode, fetchSpotifyProfile, redirectUri } from "@/lib/spotify";

export const runtime = "nodejs";

/** Where to land afterwards, with a status the UI can react to.
 *
 *  DORMANT: Spotify is not offered to users right now — the audio source is
 *  iTunes previews, which need no account. This whole flow is kept intact for
 *  when it is revived. Reviving it means restoring the settings page (see
 *  SpotifyConnect, which is still here) and pointing this back at it. */
function back(origin: string, status: string) {
  return NextResponse.redirect(new URL(`/settings?spotify=${status}`, origin));
}

/**
 * GET /api/spotify/callback — finish the connect flow.
 *
 * Swaps the authorization code for tokens and stores them. Written with the
 * service-role client on purpose: `spotify_accounts` is revoked from every
 * client role and has no RLS policies, so this route and the SECURITY DEFINER
 * helpers are the only things that can reach it.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/signin", origin));

  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");
  const expected = req.cookies.get("spotify_oauth_state")?.value;

  // The user pressed Cancel on Spotify's consent screen — not an error.
  if (denied) return back(origin, "cancelled");

  if (!code || !state || !expected || state !== expected) {
    return back(origin, "state_mismatch");
  }

  try {
    const tokens = await exchangeCode(code, redirectUri(origin));
    const profile = await fetchSpotifyProfile(tokens.access_token);

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    const { error } = await admin.from("spotify_accounts").upsert({
      user_id: user.id,
      access_token: tokens.access_token,
      // Spotify only returns a refresh token on first consent; on a
      // reconnect it may be absent, so never overwrite a good one with null.
      refresh_token: tokens.refresh_token ?? undefined,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope ?? null,
      product: profile?.product ?? null,
      spotify_user_id: profile?.id ?? null,
      display_name: profile?.display_name ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    const res = back(origin, profile?.product === "premium" ? "connected" : "not_premium");
    res.cookies.delete("spotify_oauth_state");
    return res;
  } catch (err) {
    console.error("[/api/spotify/callback]", err);
    Sentry.captureException(err, { tags: { route: "spotify_callback" } });
    return back(origin, "failed");
  }
}
