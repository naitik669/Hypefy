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
/** One rendition of a GIF as Giphy returns it. */
type GiphyImage = {
  url?: string;
  webp?: string;
  width?: string;
  height?: string;
};

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
        const imgs = (r.images ?? {}) as Record<string, GiphyImage>;
        const preview =
          imgs.fixed_height_small ?? imgs.preview_gif ?? imgs.downsized_medium;
        return {
          id: String(r.id ?? ""),
          gifUrl: imgs.downsized_medium?.url ?? imgs.original?.url ?? "",
          // WebP first: the same frame at a fraction of the bytes. The grid
          // shows two dozen of these at once, and animated GIF is the single
          // heaviest way to deliver every one of them.
          previewUrl: preview?.webp ?? preview?.url ?? "",
          // Sent so the grid can reserve the space before the image lands.
          // Without them every arrival re-flowed the masonry, which is what
          // the lag actually was — not download time, but the column heights
          // being recomputed two dozen times.
          width: Number(preview?.width) || 0,
          height: Number(preview?.height) || 0,
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
