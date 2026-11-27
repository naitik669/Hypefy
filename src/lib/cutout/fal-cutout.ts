/**
 * The server half of the sticker cutout: one photo in, one mask out, cut by
 * BiRefNet (MIT) on fal.ai. Naitik chose this over cutting on the phone on
 * 27 Nov, after the on-device model was too slow and too rough on a real
 * phone; a model good enough for clean edges is ~5x heavier, which a phone
 * CPU cannot run in reasonable time (measured).
 *
 * Takes fetch and the key as arguments, so a test drives every branch
 * without the network. Called only from /api/stickers/cutout.
 */

export const FAL_BIREFNET_URL = "https://fal.run/fal-ai/birefnet/v2";

/** The largest photo the route accepts. The studio sends ~1024 px JPEGs, far below this. */
export const CUTOUT_MAX_BYTES = 4 * 1024 * 1024;

export const CUTOUT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type CutoutFailure = "bad_input" | "too_big" | "upstream" | "no_mask";

export type CutoutAnswer = { ok: true; mask: ArrayBuffer } | { ok: false; reason: CutoutFailure; status?: number };

function toBase64(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64");
}

export async function falCutout(
  photo: ArrayBuffer,
  contentType: string,
  key: string,
  fetchImpl: typeof fetch,
): Promise<CutoutAnswer> {
  if (!CUTOUT_TYPES.has(contentType)) return { ok: false, reason: "bad_input" };
  if (photo.byteLength === 0) return { ok: false, reason: "bad_input" };
  if (photo.byteLength > CUTOUT_MAX_BYTES) return { ok: false, reason: "too_big" };

  const res = await fetchImpl(FAL_BIREFNET_URL, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // The photo travels inline, so it is never stored anywhere of ours.
      image_url: `data:${contentType};base64,${toBase64(photo)}`,
      model: "General Use (Light)",
      operating_resolution: "1024x1024",
      output_format: "png",
      // Only the mask: the studio keeps the photo's own pixels and lets the
      // person correct the mask with a finger before anything is saved.
      mask_only: true,
      sync_mode: true,
    }),
  });
  if (!res.ok) return { ok: false, reason: "upstream", status: res.status };

  const json = (await res.json().catch(() => null)) as { image?: { url?: string } } | null;
  const url = json?.image?.url;
  if (!url) return { ok: false, reason: "no_mask" };

  // sync_mode answers with a data URI; without it, a URL on fal's CDN.
  const maskRes = await fetchImpl(url);
  if (!maskRes.ok) return { ok: false, reason: "upstream", status: maskRes.status };
  const mask = await maskRes.arrayBuffer();
  if (mask.byteLength === 0) return { ok: false, reason: "no_mask" };
  return { ok: true, mask };
}
