import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { guardApi } from "@/lib/api-guard";
import { falCutout, CUTOUT_MAX_BYTES } from "@/lib/cutout/fal-cutout";

/**
 * POST /api/stickers/cutout — body: the photo (image/jpeg, png or webp).
 * Answers with the subject's mask as a greyscale PNG.
 *
 * Signed-in only and rate-limited (migration 0222: 40 an hour), because each
 * call is paid for. FAL_KEY is server-only. When it is not set the route says
 * so with a 503, and the studio cuts on the device instead.
 */
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const blocked = await guardApi("cutout");
  if (blocked) return blocked;

  const key = process.env.FAL_KEY;
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > CUTOUT_MAX_BYTES) return NextResponse.json({ error: "too_big" }, { status: 413 });

  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim();
  const photo = await req.arrayBuffer();

  try {
    const answer = await falCutout(photo, contentType, key, fetch);
    if (answer.ok) {
      return new NextResponse(answer.mask, {
        status: 200,
        headers: { "content-type": "image/png", "cache-control": "no-store" },
      });
    }
    const status = answer.reason === "bad_input" ? 400 : answer.reason === "too_big" ? 413 : 502;
    if (status === 502) Sentry.captureMessage(`sticker cutout upstream: ${answer.reason} ${answer.status ?? ""}`);
    return NextResponse.json({ error: answer.reason }, { status });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
