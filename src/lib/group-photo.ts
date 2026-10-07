/**
 * A group's picture: any photo, cut to a centred square and made small
 * enough to be an avatar before it is uploaded.
 */

/** The side the picture is saved at. An avatar is never shown larger than this. */
export const GROUP_PHOTO_SIDE = 512;
/** Larger files than this are refused before they are even opened. */
export const GROUP_PHOTO_MAX_BYTES = 15 * 1024 * 1024;

/** The centred square of a w×h picture: where it starts and how wide it is. */
export function centredSquare(w: number, h: number): { sx: number; sy: number; side: number } {
  const side = Math.max(0, Math.min(w, h));
  return { sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), side };
}

/** Why a file cannot be a group picture, or null when it can. */
export function groupPhotoProblem(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith("image/")) return "Choose a photo.";
  if (file.size > GROUP_PHOTO_MAX_BYTES) return "That photo is too large. Choose one under 15 MB.";
  return null;
}

/** The file as a square JPEG. Rejects when the browser cannot read it as a picture. */
export async function toSquareJpeg(file: Blob, side = GROUP_PHOTO_SIDE): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const crop = centredSquare(bitmap.width, bitmap.height);
    if (crop.side === 0) throw new Error("empty picture");
    const out = Math.min(side, crop.side);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, crop.sx, crop.sy, crop.side, crop.side, 0, 0, out, out);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not save picture"))), "image/jpeg", 0.88),
    );
  } finally {
    bitmap.close();
  }
}
