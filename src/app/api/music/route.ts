import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { guardApi } from "@/lib/api-guard";

/**
 * GET /api/music?q=query
 *
 * Server-side proxy for the iTunes Search API — free, no key, returns 30s
 * preview MP3s + artwork. Proxied so we control the response shape and can
 * cache; results are shaped to the app's Track type.
 */
export type Track = {
  id: string;
  title: string;
  artist: string;
  artwork: string; // 100x100 jpg
  preview: string; // ~30s m4a
  appleUrl?: string; // Apple Music / iTunes song page (attribution + full listen)
};

export async function GET(req: NextRequest) {
  const blocked = await guardApi("music");
  if (blocked) return blocked;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ tracks: [] });

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=20`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      return NextResponse.json({ error: "iTunes error", status: res.status }, { status: 502 });
    }
    const json = await res.json();

    const tracks: Track[] = ((json.results ?? []) as Record<string, unknown>[])
      .map((r) => ({
        id: String(r.trackId ?? ""),
        title: String(r.trackName ?? ""),
        artist: String(r.artistName ?? ""),
        artwork: String(r.artworkUrl100 ?? r.artworkUrl60 ?? ""),
        preview: String(r.previewUrl ?? ""),
        appleUrl: String(r.trackViewUrl ?? "") || undefined,
      }))
      .filter((t) => t.id && t.title && t.preview);

    return NextResponse.json({ tracks });
  } catch (err) {
    console.error("[/api/music]", err);
    Sentry.captureException(err, { tags: { route: "music" } });
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
