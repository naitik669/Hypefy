import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { refreshAccessToken } from "@/lib/spotify";

export const runtime = "nodejs";

/**
 * GET /api/spotify/token — a usable access token for the Web Playback SDK.
 *
 * The SDK runs in the browser and asks for an OAuth token, so one has to be
 * handed to the client. Only the short-lived *access* token ever leaves the
 * server: the refresh token stays in `spotify_accounts`, which no client role
 * can read. That is the whole reason refresh happens here rather than in the
 * page.
 *
 * Returns 409 rather than a token when the account is not Premium — the SDK
 * cannot play for free accounts, and failing here with a reason is far easier
 * to act on than an opaque error inside Spotify's player.
 */
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: row, error } = await admin
    .from("spotify_accounts")
    .select("access_token, refresh_token, expires_at, product")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    Sentry.captureException(error, { tags: { route: "spotify_token" } });
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: "not_connected" }, { status: 404 });
  if (row.product !== "premium") {
    return NextResponse.json({ error: "not_premium" }, { status: 409 });
  }

  // 60s of slack: a token that expires while the SDK is connecting fails in a
  // way the player reports as a generic authentication error.
  if (new Date(row.expires_at).getTime() > Date.now() + 60_000) {
    return NextResponse.json({ accessToken: row.access_token });
  }

  try {
    const next = await refreshAccessToken(row.refresh_token);
    await admin
      .from("spotify_accounts")
      .update({
        access_token: next.access_token,
        // Spotify sometimes rotates the refresh token; keep the old one when
        // it does not, or the connection dies on the following refresh.
        ...(next.refresh_token ? { refresh_token: next.refresh_token } : {}),
        expires_at: new Date(Date.now() + next.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return NextResponse.json({ accessToken: next.access_token });
  } catch (err) {
    console.error("[/api/spotify/token] refresh failed", err);
    Sentry.captureException(err, { tags: { route: "spotify_token" } });
    // The refresh token is dead (revoked in Spotify's own settings, most
    // likely). Drop the row so the UI offers "Connect" again instead of
    // retrying a token that can never work.
    await admin.from("spotify_accounts").delete().eq("user_id", user.id);
    return NextResponse.json({ error: "reconnect_required" }, { status: 401 });
  }
}
