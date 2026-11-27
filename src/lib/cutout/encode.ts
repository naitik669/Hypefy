/**
 * Turning finished sticker pixels into a file the stickers bucket accepts.
 *
 * The bucket takes PNG or WebP up to 1 MB (the sticker foundation's
 * migration sets that cap). WebP is tried first because a photo cutout is
 * several times smaller in it; Safari cannot encode WebP from a canvas and
 * quietly hands back a PNG instead, which is accepted too. If the file is
 * still over the cap, the sticker is made smaller until it fits.
 *
 * The scaler and encoder are passed in, so a test drives every branch.
 */

export const STICKER_MAX_SIDE = 512;
export const STICKER_MAX_BYTES = 1024 * 1024;
/** Below this a sticker is not worth sending; give up rather than shrink further. */
export const STICKER_MIN_SIDE = 96;

export type EncodedSticker = { blob: Blob; w: number; h: number };

export type EncodeDeps = {
  scale: (rgba: Uint8ClampedArray, w: number, h: number, tw: number, th: number) => Uint8ClampedArray;
  encoder: (rgba: Uint8ClampedArray, w: number, h: number) => (type: string, quality?: number) => Promise<Blob | null>;
};

const ACCEPTED = new Set(["image/webp", "image/png"]);

export async function encodeSticker(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  deps: EncodeDeps,
  maxSide = STICKER_MAX_SIDE,
): Promise<EncodedSticker | null> {
  let side = maxSide;
  for (;;) {
    const long = Math.max(w, h);
    const s = long > side ? side / long : 1;
    const tw = Math.max(1, Math.round(w * s));
    const th = Math.max(1, Math.round(h * s));
    const pixels = s === 1 ? rgba : deps.scale(rgba, w, h, tw, th);
    const encode = deps.encoder(pixels, tw, th);
    let blob = await encode("image/webp", 0.9);
    if (!blob || !ACCEPTED.has(blob.type)) blob = await encode("image/png");
    if (!blob || !ACCEPTED.has(blob.type)) return null;
    if (blob.size <= STICKER_MAX_BYTES) return { blob, w: tw, h: th };
    const next = Math.floor(Math.max(tw, th) * 0.75);
    if (next < STICKER_MIN_SIDE) return null;
    side = next;
  }
}
