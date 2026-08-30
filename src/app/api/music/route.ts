import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { guardApi } from "@/lib/api-guard";

/**
 * GET /api/music?q=query
 *
 * Server-side proxy for the Spotify Web API search endpoint, shaped to the
 * app's Track type.
 *
 * Uses the Client Credentials flow: an app-level token, not a user login.
 * That matters — searching and playing a 30s preview needs no Spotify
 * account from the listener, so posts stay audible for everyone. Playing
 * *full* tracks would instead require every listener to sign in with
 * Spotify Premium via the Web Playback SDK, which is why that is not the
 * route taken here.
 *
 * Credentials are server-only and never reach the client:
 *   SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET
 */
export type Track = {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  /** 30s mp3. Spotify returns null for this on newly-created apps, so it is
   *  usually empty — playback goes through `uri` and the Web Playback SDK. */
  preview: string;
  /** `spotify:track:…` — what the Web Playback SDK plays, full length. */
  uri?: string;
  /** Length of the real track, for the snippet timeline. */
  durationMs?: number;
  appleUrl?: string; // "listen on" link — the Spotify track page
};

/** App token, cached across requests. Spotify tokens last an hour, so
 *  minting a fresh one per search would be a wasted round trip on every
 *  keystroke of a search-as-you-type field. */
let token: { value: string; expiresAt: number } | null = null;

async function getToken(id: string, secret: string): Promise<string> {
  // 30s of slack so a token cannot expire mid-flight.
  if (token && token.expiresAt > Date.now() + 30_000) return token.value;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`spotify token ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return token.value;
}

type SpotifyTrack = {
  id?: string;
  name?: string;
  preview_url?: string | null;
  artists?: { name?: string }[];
  album?: { images?: { url?: string; width?: number }[] };
  external_urls?: { spotify?: string };
  uri?: string;
  duration_ms?: number;
};

export async function GET(req: NextRequest) {
  const blocked = await guardApi("music");
  if (blocked) return blocked;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ tracks: [] });

  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    console.error("[/api/music] SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set");
    return NextResponse.json({ error: "Music search is not configured" }, { status: 503 });
  }

  try {
    const access = await getToken(id, secret);
    // Capped at 10: these credentials reject 11+ with `400 Invalid limit`,
    // despite the docs advertising 50.
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${access}` },
      next: { revalidate: 60 },
    });

    if (res.status === 401) {
      // Token rejected — drop it so the next attempt mints a fresh one.
      token = null;
      return NextResponse.json({ error: "Spotify auth failed" }, { status: 502 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "Spotify error", status: res.status }, { status: 502 });
    }

    const json = (await res.json()) as { tracks?: { items?: SpotifyTrack[] } };
    const items = json.tracks?.items ?? [];

    const tracks: Track[] = items
      .map((r) => {
        // Album art comes largest-first; take a middle size rather than the
        // 640px original for what renders as a 56px chip.
        const imgs = r.album?.images ?? [];
        const art = imgs.find((i) => (i.width ?? 0) <= 320) ?? imgs[imgs.length - 1] ?? imgs[0];
        return {
          id: String(r.id ?? ""),
          title: String(r.name ?? ""),
          artist: (r.artists ?? []).map((a) => a.name).filter(Boolean).join(", "),
          artwork: String(art?.url ?? ""),
          preview: String(r.preview_url ?? ""),
          uri: r.uri || undefined,
          durationMs: typeof r.duration_ms === "number" ? r.duration_ms : undefined,
          appleUrl: r.external_urls?.spotify || undefined,
        };
      })
      // Playable means either a URI the Playback SDK can take, or a preview
      // mp3. Filtering on preview alone would drop the entire catalogue,
      // since Spotify returns preview_url: null for newly-created apps.
      .filter((t) => t.id && t.title && (t.uri || t.preview));

    return NextResponse.json({ tracks });
  } catch (err) {
    console.error("[/api/music]", err);
    Sentry.captureException(err, { tags: { route: "music" } });
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
