import "server-only";

/**
 * Server-side Spotify helpers for the per-user connection.
 *
 * Distinct from the app-level Client Credentials token in /api/music: that
 * one can search but can never play. Playback needs a *user* token from an
 * account with Premium, which is what these functions manage.
 */

/** Scopes: `streaming` is what the Web Playback SDK requires; the two
 *  read scopes are only there to learn whether the account is Premium, so
 *  the UI can say so instead of failing silently inside the SDK. */
export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
].join(" ");

export function spotifyEnv() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  return { clientId, clientSecret };
}

/**
 * The redirect URI must match what is registered in the Spotify dashboard
 * character for character.
 *
 * Prefers an explicit env var because the derived origin is wrong more often
 * than it looks: behind Vercel previews the host changes per deployment, and
 * Spotify no longer accepts `localhost` at all — local development has to be
 * reached over `127.0.0.1`.
 */
export function redirectUri(origin: string): string {
  return process.env.SPOTIFY_REDIRECT_URI || `${origin}/api/spotify/callback`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const { clientId, clientSecret } = spotifyEnv();
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`spotify token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

export function exchangeCode(code: string, redirect: string) {
  return tokenRequest(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect }),
  );
}

export function refreshAccessToken(refreshToken: string) {
  return tokenRequest(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  );
}

/** Whose account this is, and crucially whether it is Premium. */
export async function fetchSpotifyProfile(accessToken: string) {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as {
    id?: string;
    display_name?: string | null;
    product?: string; // "premium" | "free" | "open"
  };
}
