/**
 * Getting a photo small enough to upload, without cutting anything off.
 *
 * The composer let you pick a 10MB image and the post-images bucket refused
 * anything over 1.5MB (0007), so every photo in between passed every check
 * on the way in and died at the upload as "Couldn't share your post". A
 * modern phone JPEG is 3-6MB, so that was most photos, most of the time.
 *
 * Two halves to the fix. 0197 raises the bucket to the number the composer
 * already promises, so the two cannot disagree. This file is the other
 * half: shrink the photo before it goes, so the usual upload is about a
 * megabyte rather than merely a permitted six.
 *
 * Shrinking is not cropping. Auto mode keeps the whole frame on purpose —
 * "nothing gets cut off" is the entire point of it, and it is the default,
 * which is exactly why Auto was where this bug lived: a cropped photo is
 * re-encoded through a canvas and comes out small by accident, an Auto one
 * was passed through untouched at whatever size the camera made it. Fitting
 * inside a box keeps every pixel of the frame and only reduces how many
 * there are of them, so Auto's promise survives.
 *
 * The type is kept rather than forced to JPEG: a PNG re-encoded as JPEG
 * loses its transparency, and a photo that was WebP has no reason to stop
 * being one. A PNG also may not shrink much, which is the other reason the
 * bucket ceiling still has to be raised and not just relied upon.
 */

/** The longest edge we upload. Beyond this a phone screen cannot show the difference. */
export const UPLOAD_MAX_EDGE = 2048;

/** JPEG/WebP quality for the re-encode. Matches capturePoster's 0.82. */
export const UPLOAD_QUALITY = 0.82;

/** The largest file a person may pick. The bucket is set to match, in 0197. */
export const MAX_POST_IMAGE_MB = 10;

/**
 * Under this, leave the file completely alone.
 *
 * Re-encoding a small photo can make it BIGGER — a 300kB JPEG decoded and
 * written back out at quality 0.82 is not reliably smaller, and it is never
 * better. Only touch what is actually too big to be comfortable.
 */
export const SHRINK_OVER_BYTES = 1_200_000;

/** Canvas can only write these. Anything else is passed through untouched. */
const RE_ENCODABLE = ["image/jpeg", "image/png", "image/webp"];

/**
 * The size a `width`x`height` image becomes inside a `maxEdge` box.
 *
 * Pure, so the arithmetic is tested rather than eyeballed through a canvas.
 * Never scales up: an image already inside the box is returned as it is.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = UPLOAD_MAX_EDGE,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / longest;
  // Floored at 1: a very long, very thin image must not round to zero, which
  // is a canvas of no area and an empty blob.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Whether a file is worth re-encoding at all. */
export function worthShrinking(file: { size: number; type?: string }): boolean {
  return file.size > SHRINK_OVER_BYTES && RE_ENCODABLE.includes(file.type ?? "");
}

/**
 * A smaller version of the photo, or the original when it cannot be helped.
 *
 * Never rejects. Every failure path — a file the browser cannot decode, a
 * canvas that returns nothing, a type it will not write — returns the file
 * untouched, because a photo that uploads at full size is a slow post and a
 * photo that throws here is no post at all. The bucket ceiling is what
 * actually enforces the limit; this only tries to stay well under it.
 */
export async function shrinkForUpload(
  file: File,
  maxEdge: number = UPLOAD_MAX_EDGE,
): Promise<File> {
  if (!worthShrinking(file)) return file;
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    if (width === 0 || height === 0) return file;
    // Already inside the box: re-encoding would only lose quality for nothing.
    if (width === bitmap.width && height === bitmap.height) return file;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const type = file.type;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, UPLOAD_QUALITY),
    );
    if (!blob || blob.size === 0) return file;
    // If the round trip did not actually help, keep the original.
    if (blob.size >= file.size) return file;

    return new File([blob], file.name, { type, lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}
