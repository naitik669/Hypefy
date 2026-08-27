import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { guardApi } from "@/lib/api-guard";

/**
 * GET /api/gifs?q=query
 * GET /api/gifs          ← trending
 *
 * Server-side proxy for Giphy so the API key is never exposed in the browser.
 * Uses GIPHY_API_KEY (no NEXT_PUBLIC_ prefix — server-only).
 */
export async function GET(req: NextRequest) {
  const blocked = await guardApi("gifs");
  if (blocked) return blocked;

  const key = process.env.GIPHY_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "GIPHY_API_KEY not configured" }, { status: 503 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = 24;
  const rating = "pg-13";

  const giphyUrl = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=${limit}&rating=${rating}&lang=en`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=${limit}&rating=${rating}`;

  try {
    const res = await fetch(giphyUrl, { next: { revalidate: 60 } });
    if (!res.ok) {
      return NextResponse.json({ error: "Giphy error", status: res.status }, { status: 502 });
    }
    const json = await res.json();

    // Shape the response — only send what the picker needs
    const gifs = ((json.data ?? []) as Record<string, unknown>[])
      .map((r) => {
        const imgs = (r.images ?? {}) as Record<string, { url?: string }>;
        return {
          id: String(r.id ?? ""),
          gifUrl: imgs.downsized_medium?.url ?? imgs.original?.url ?? "",
          previewUrl:
            imgs.fixed_height_small?.url ??
            imgs.preview_gif?.url ??
            imgs.downsized_medium?.url ??
            "",
          title: String(r.title ?? ""),
        };
      })
      .filter((g) => g.gifUrl && g.previewUrl);

    return NextResponse.json({ gifs });
  } catch (err) {
    console.error("[/api/gifs]", err);
    Sentry.captureException(err, { tags: { route: "gifs" } });
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
