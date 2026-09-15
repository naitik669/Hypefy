import { applyFilterPixels, filterCss, tintCss, type PhotoFilter } from "@/lib/photo-filters";

/**
 * Turning the camera into a photo.
 *
 * Photos used to be a screenshot of the video preview: at best 1080p, and
 * softened by the video encoder. Where the browser has ImageCapture (Chrome
 * and the Android app) the phone now takes a real still — the full sensor,
 * through the camera's own photo processing — and the video frame is only
 * the fallback.
 */

/** The centred crop of a w×h picture to `aspect` (width / height). */
export function cropRect(w: number, h: number, aspect: number) {
  if (w / h > aspect) {
    const sw = Math.round(h * aspect);
    return { sx: Math.round((w - sw) / 2), sy: 0, sw, sh: h };
  }
  const sh = Math.round(w / aspect);
  return { sx: 0, sy: Math.round((h - sh) / 2), sw: w, sh };
}

/** Scale w×h down (never up) so its long edge is at most `maxLong`. */
export function fitWithin(w: number, h: number, maxLong: number) {
  const k = Math.min(1, maxLong / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/**
 * Pick the main back camera. Phones list several back lenses (main, wide,
 * zoom), and "facing: environment" can land on a zoom lens, which is the
 * whole picture looking magnified. Android names them "camera2 N, facing
 * back"; the main lens is the lowest N. Returns null when there is nothing
 * better than `currentId`.
 */
export function pickMainBackCamera(
  devices: { deviceId: string; label: string; kind: string }[],
  currentId: string | undefined,
): string | null {
  const back = devices.filter((d) => d.kind === "videoinput" && /back|rear|environment/i.test(d.label));
  if (back.length < 2) return null;
  const index = (label: string) => {
    const m = /camera2?\s*(\d+)/i.exec(label);
    return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
  };
  const main = [...back].sort((a, b) => index(a.label) - index(b.label))[0];
  return main.deviceId && main.deviceId !== currentId ? main.deviceId : null;
}

type ImageCaptureLike = {
  takePhoto(settings?: { imageWidth?: number; imageHeight?: number }): Promise<Blob>;
  getPhotoCapabilities?(): Promise<{ imageWidth?: { max: number }; imageHeight?: { max: number } }>;
};

const timeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

/**
 * A full-resolution still from the camera, or null when the browser can't or
 * the result doesn't match the preview's orientation (some devices return the
 * sensor's sideways picture; the preview frame is the safer choice then).
 */
export async function takeStill(track: MediaStreamTrack, portrait: boolean): Promise<ImageBitmap | null> {
  const Ctor = (globalThis as { ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike }).ImageCapture;
  if (!Ctor || track.readyState !== "live") return null;
  try {
    const capture = new Ctor(track);
    const caps = await timeout(capture.getPhotoCapabilities?.() ?? Promise.resolve(undefined), 2000).catch(() => undefined);
    const settings =
      caps?.imageWidth?.max && caps?.imageHeight?.max
        ? { imageWidth: caps.imageWidth.max, imageHeight: caps.imageHeight.max }
        : undefined;
    const blob = await timeout(capture.takePhoto(settings), 6000);
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    if (bitmap.height > bitmap.width !== portrait) {
      bitmap.close();
      return null;
    }
    return bitmap;
  } catch {
    return null;
  }
}

/**
 * Draw a picture to a JPEG: cropped to what the viewfinder showed, mirrored
 * for the selfie camera, filtered, and capped at a sensible size to upload.
 */
export function renderPhoto(
  source: CanvasImageSource,
  width: number,
  height: number,
  opts: { aspect: number; mirror: boolean; filter: PhotoFilter; maxLong?: number },
): Promise<Blob | null> {
  const crop = cropRect(width, height, opts.aspect);
  const out = fitWithin(crop.sw, crop.sh, opts.maxLong ?? 2560);
  const canvas = document.createElement("canvas");
  canvas.width = out.w;
  canvas.height = out.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  const css = filterCss(opts.filter);
  const nativeFilter = css !== "none" && typeof (ctx as { filter?: unknown }).filter === "string";
  if (nativeFilter) ctx.filter = css;
  if (opts.mirror) {
    ctx.translate(out.w, 0);
    ctx.scale(-1, 1);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, out.w, out.h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (nativeFilter) ctx.filter = "none";

  if (css !== "none" && !nativeFilter) {
    const img = ctx.getImageData(0, 0, out.w, out.h);
    applyFilterPixels(img.data, opts.filter);
    ctx.putImageData(img, 0, 0);
  }
  const tint = tintCss(opts.filter);
  if (tint) {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, out.w, out.h);
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92));
}
