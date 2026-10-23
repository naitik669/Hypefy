import sharp from "sharp";
import { HASH_H, HASH_W, dhash, toGrayscale } from "@/lib/media-hash";

/**
 * The perceptual hash of an image, computed on the server from its bytes.
 *
 * The browser's hash is what the client claims; this is what is true. A
 * crafted request can send the hash of a different picture, so the upload
 * check alone stops a person re-posting a photo, not a person writing an
 * HTTP client. Recomputing here is what closes that.
 *
 * Deliberately the same arithmetic as the client: flattened onto white so a
 * transparent PNG reads the way media-hash.ts says it should, then the same
 * Rec. 601 luma and the same dHash. Two implementations of "the hash" that
 * disagreed would be worse than one, because the blocklist would be built
 * from one and checked against the other.
 *
 * Returns null when the bytes are not a decodable image. Null means "we do
 * not know", and every caller must read it as "allow": refusing content
 * because a decoder tripped is a harm nobody can see or appeal.
 */
export async function hashImageBuffer(bytes: Buffer | Uint8Array): Promise<string | null> {
  try {
    const { data, info } = await sharp(bytes, { failOn: "none" })
      // Alpha composited onto white BEFORE the resize, so a transparent
      // border cannot drag the edge pixels toward black and invert the
      // gradients the hash is made of.
      .flatten({ background: "#ffffff" })
      .ensureAlpha()
      // `fill` rather than `cover`: the hash describes the whole picture, and
      // cropping to a square would throw away the part that distinguishes a
      // wide image from a tall one.
      .resize(HASH_W, HASH_H, { fit: "fill", kernel: "cubic" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.channels !== 4 || data.length !== HASH_W * HASH_H * 4) return null;
    return dhash(toGrayscale(new Uint8ClampedArray(data)));
  } catch {
    // A corrupt file, an unsupported format, a decompression bomb sharp
    // refused. All the same answer.
    return null;
  }
}

/** The largest image this will decode. Past it, the answer is "we do not know". */
export const MAX_DECODE_BYTES = 25 * 1024 * 1024;

/**
 * Whether a URL is one of our own stored objects.
 *
 * The URLs come from `media_fingerprints`, which a forged `claim_media` call
 * can put anything into — so this is the thing standing between a moderation
 * job and being a server-side request forgery tool pointed at anything with
 * an address. Same shape as isPushEndpointAllowed in api-guard.ts.
 */
export function isOwnStorageUrl(url: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): boolean {
  if (!supabaseUrl) return false;
  try {
    const target = new URL(url);
    const own = new URL(supabaseUrl);
    return (
      target.protocol === "https:" &&
      target.hostname === own.hostname &&
      target.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}
