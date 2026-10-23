"use client";

import { HASH_H, HASH_W, dhash, toGrayscale } from "@/lib/media-hash";

/**
 * The perceptual hash of a picked file, computed in the browser.
 *
 * The pure half of this lives in media-hash.ts and is tested there. All this
 * adds is getting pixels out of a file, which needs a canvas and therefore
 * cannot be tested in Node — so it is kept as small as possible and does
 * nothing a reader has to reason about.
 *
 * Two decoders, for the same reason chat-album-upload has two:
 * createImageBitmap is faster and handles EXIF orientation, and some Android
 * WebViews give up on large files where a plain <img> copes.
 *
 * Returns null when the file cannot be decoded. A null is "we do not know",
 * and the caller must treat it as "let it through" — refusing an upload
 * because the hash failed would turn a decoder quirk into a person being
 * unable to post, which is a far worse outcome than a missed match.
 */
export async function hashImageFile(file: Blob): Promise<string | null> {
  const source = await decode(file);
  if (!source) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = HASH_W;
    canvas.height = HASH_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    // The browser's own downscale is the averaging step, and it is what makes
    // the hash survive re-encoding: every one of the thumbnail's 72 pixels is
    // the mean of a large block, so sensor and compression noise cancels out.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source.image, 0, 0, HASH_W, HASH_H);
    const { data } = ctx.getImageData(0, 0, HASH_W, HASH_H);
    return dhash(toGrayscale(data));
  } catch {
    // A tainted canvas, a hostile file, a browser without getImageData.
    return null;
  } finally {
    source.done();
  }
}

type Decoded = { image: CanvasImageSource; done: () => void };

async function decode(blob: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { image: bmp, done: () => bmp.close() };
    } catch {
      /* fall through to the <img> path */
    }
  }
  if (typeof Image === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      // A file that neither loads nor errors must not hold an upload up.
      const timer = setTimeout(() => reject(new Error("decode")), 8_000);
      img.onload = () => { clearTimeout(timer); resolve(); };
      img.onerror = () => { clearTimeout(timer); reject(new Error("decode")); };
      img.src = url;
    });
    return { image: img, done: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}
