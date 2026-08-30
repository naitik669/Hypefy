import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SPOTIFY_SCOPES, redirectUri, spotifyEnv } from "@/lib/spotify";

export const runtime = "nodejs";

/**
 * GET /api/spotify/auth — start the Spotify connect flow.
 *
 * Sends the user to Spotify's consent screen. The `state` is a random value
 * echoed back by Spotify and compared in the callback, which is what stops a
 * third party from feeding us an authorization code for *their* account. It
 * rides in an httpOnly cookie so the page itself cannot read or forge it.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/signin", req.nextUrl.origin));

  const { clientId } = spotifyEnv();
  if (!clientId) {
    return NextResponse.json({ error: "Spotify is not configured" }, { status: 503 });
  }

  const state = crypto.randomUUID();
  const redirect = redirectUri(req.nextUrl.origin);

  const authUrl =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: SPOTIFY_SCOPES,
      redirect_uri: redirect,
      state,
      // Always show the consent screen, so a user who connected the wrong
      // account can switch without clearing Spotify's own session first.
      show_dialog: "true",
    });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("spotify_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // must survive the redirect back from Spotify
    path: "/",
    maxAge: 600,
  });
  return res;
}
