/**
 * Turn a picked picture into a sticker file: at most 512 px on its longer
 * side, transparency kept.
 *
 * WebP where the browser can encode it from a canvas, PNG where it cannot
 * (older Safari hands back a PNG when asked for WebP; whatever it hands back
 * is what gets uploaded, and the bucket takes both). Never JPEG: a cutout's
 * transparent background would turn black.
 *
 * Browser-only, so it lives here rather than in @hypefy/core. The sizing
 * rule itself is stickerFit in core, where it is tested.
 */
import { stickerFit } from "@hypefy/core/stickers";

export type PreparedSticker = { blob: Blob; width: number; height: number };

const STICKER_TYPES = ["image/png", "image/webp", "image/jpeg", "image/heic", "image/heif", "image/avif"];

/** Whether a picked file is a picture this can make a sticker from. */
export function canBecomeSticker(type: string): boolean {
  return STICKER_TYPES.includes(type);
}

export async function prepareStickerImage(file: Blob): Promise<PreparedSticker> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = stickerFit(bitmap.width, bitmap.height);
    if (!width || !height) throw new Error("That picture is empty.");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't draw that picture.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    if (!blob) throw new Error("This browser can't save that picture.");
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
