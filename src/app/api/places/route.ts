import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { placeFrom, placesFrom } from "@/lib/places";

/**
 * GET /api/places?q=meer           — places matching what was typed
 * GET /api/places?lat=28.9&lon=77.7 — the place you are standing in
 *
 * For the location sticker on a Show. Asks OpenStreetMap's Nominatim from
 * the server rather than the browser so the request carries an honest
 * User-Agent, as its usage policy asks, and so it is capped per person by
 * the same limiter as every other outbound route.
 */
const BASE = "https://nominatim.openstreetmap.org";
const HEADERS = { "user-agent": "Hypefy/1.0 (+https://hypefy.app)", accept: "application/json" };

export async function GET(req: NextRequest) {
  const blocked = await guardApi("places");
  if (blocked) return blocked;

  const params = req.nextUrl.searchParams;
  const lang = (req.headers.get("accept-language") ?? "en").split(",")[0].slice(0, 20);
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));

  try {
    if (q.length >= 2) {
      const url = `${BASE}/search?format=jsonv2&addressdetails=1&limit=6&accept-language=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(5000) });
      if (!res.ok) return NextResponse.json({ places: [] });
      return NextResponse.json({ places: placesFrom(await res.json()) });
    }
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      const url = `${BASE}/reverse?format=jsonv2&addressdetails=1&zoom=14&accept-language=${encodeURIComponent(lang)}&lat=${lat}&lon=${lon}`;
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(5000) });
      if (!res.ok) return NextResponse.json({ places: [] });
      const place = placeFrom(await res.json());
      return NextResponse.json({ places: place ? [place] : [] });
    }
  } catch {
    // A slow or failed lookup is no suggestions, not an error: the place
    // can still be typed by hand.
  }
  return NextResponse.json({ places: [] });
}
