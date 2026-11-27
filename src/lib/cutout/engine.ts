/**
 * The browser side of the cutout: decode a photo, ask the model worker for
 * its subject, and encode the finished sticker. Everything that is arithmetic
 * is in ./mask.ts and tested there; this file is the glue that needs a real
 * browser (canvas, Worker, createImageBitmap) and is exercised by
 * tests/e2e-cutout (Playwright) rather than jsdom.
 *
 * Web only. The Expo app cannot run this WebAssembly runtime, so the phone
 * app has no cutout before launch — it would need ML Kit or a server route.
 */
import { MODEL_SIZE, fitWithin, toModelInput, predictionToMask, keptBounds, cutoutPixels, maskFromImage, type Rect } from "./mask";
import { loadModelBytes, pruneOldModels, type Progress } from "./model-loader";
import { encodeSticker, STICKER_MAX_SIDE, type EncodedSticker } from "./encode";

/**
 * The resolution the studio works at. Bigger than the 512 px a sticker is
 * saved at, so the finger-painted edge is still crisp after downscaling, and
 * small enough that one undo snapshot (one byte a pixel) is at most 1 MB.
 */
export const WORK_MAX_SIDE = 1024;

export type Photo = {
  /** The photo at work resolution, RGBA. */
  rgba: Uint8ClampedArray;
  w: number;
  h: number;
};

/** Decode a picked file to RGBA at work resolution, EXIF orientation applied. */
export async function decodePhoto(file: Blob): Promise<Photo> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { w, h } = fitWithin(bmp.width, bmp.height, WORK_MAX_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d canvas");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return { rgba: ctx.getImageData(0, 0, w, h).data, w, h };
}

type Pending = { resolve: (p: Float32Array) => void; reject: (e: Error) => void };

/**
 * One model, loaded once per page. `prepare()` can be called as soon as the
 * studio opens, so the download and the runtime's start-up overlap with the
 * person choosing a photo.
 */
export class CutoutEngine {
  private worker: Worker | null = null;
  private ready: Promise<number> | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  /** How many threads the runtime got: 1 means the page was not isolated. */
  threads = 0;

  prepare(onProgress?: (p: Progress) => void): Promise<number> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const deps = { fetch: (u: string) => fetch(u), caches: typeof caches === "undefined" ? undefined : caches };
      void pruneOldModels(deps);
      const model = await loadModelBytes(deps, onProgress);
      const worker = new Worker("/cutout/cutout-worker.js", { type: "module" });
      this.worker = worker;
      const threads = await new Promise<number>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent) => {
          const m = e.data;
          if (m.type === "ready") resolve(m.threads);
          else if (m.type === "error") reject(new Error(m.message));
        };
        worker.onerror = (e) => reject(new Error(e.message || "cutout worker failed to start"));
        worker.postMessage({ type: "init", model }, [model]);
      });
      worker.onmessage = (e: MessageEvent) => this.onResult(e.data);
      this.threads = threads;
      return threads;
    })();
    // A failed start can be retried: forget it so the next prepare() tries again.
    this.ready.catch(() => {
      this.ready = null;
      this.worker?.terminate();
      this.worker = null;
    });
    return this.ready;
  }

  private onResult(m: { type: string; id: number; pred?: Float32Array; message?: string }) {
    const p = this.pending.get(m.id);
    if (!p) return;
    this.pending.delete(m.id);
    if (m.type === "result" && m.pred) p.resolve(m.pred);
    else p.reject(new Error(m.message ?? "cutout failed"));
  }

  /** The photo's subject as a mask the photo's size. */
  async cut(photo: Photo): Promise<Uint8ClampedArray> {
    await this.prepare();
    const worker = this.worker;
    if (!worker) throw new Error("cutout worker not running");
    const input = toModelInput(photo.rgba, photo.w, photo.h, MODEL_SIZE);
    const id = this.nextId++;
    const pred = await new Promise<Float32Array>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ type: "run", id, input, size: MODEL_SIZE }, [input.buffer]);
    });
    return predictionToMask(pred, MODEL_SIZE, photo.w, photo.h);
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    for (const p of this.pending.values()) p.reject(new Error("closed"));
    this.pending.clear();
  }
}

/**
 * Cut on the server: the photo at work resolution goes up as a JPEG, the
 * mask comes back as a greyscale PNG and is scaled to the photo's size.
 * Throws on any failure, so the caller can fall back to the device.
 */
export async function serverCut(photo: Photo): Promise<Uint8ClampedArray> {
  const canvas = document.createElement("canvas");
  canvas.width = photo.w;
  canvas.height = photo.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(photo.rgba), photo.w, photo.h), 0, 0);
  const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  if (!jpeg) throw new Error("could not encode the photo");
  const res = await fetch("/api/stickers/cutout", { method: "POST", body: jpeg, headers: { "content-type": "image/jpeg" } });
  if (!res.ok) throw new Error(`cutout server ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const out = document.createElement("canvas");
  out.width = photo.w;
  out.height = photo.h;
  const octx = out.getContext("2d", { willReadFrequently: true });
  if (!octx) throw new Error("no 2d canvas");
  octx.drawImage(bmp, 0, 0, photo.w, photo.h);
  bmp.close();
  return maskFromImage(octx.getImageData(0, 0, photo.w, photo.h).data);
}

/** Draw RGBA pixels into a canvas and encode it with the browser's encoder. */
function canvasEncoder(rgba: Uint8ClampedArray, w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  return (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Scale RGBA pixels with the canvas's own (smoothed) resampling. */
function canvasScale(rgba: Uint8ClampedArray, w: number, h: number, tw: number, th: number): Uint8ClampedArray {
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  src.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  const dst = document.createElement("canvas");
  dst.width = tw;
  dst.height = th;
  const ctx = dst.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, tw, th);
  return ctx.getImageData(0, 0, tw, th).data;
}

/**
 * The finished sticker: the photo's colours under the mask, cropped to what
 * is kept, at most STICKER_MAX_SIDE on its long side. Null when nothing is
 * kept. The edge (stroke or clean) is NOT drawn in: it is a per-sticker
 * value the renderer applies, so it can change after saving.
 */
export async function exportSticker(photo: Photo, mask: Uint8ClampedArray): Promise<EncodedSticker | null> {
  const box: Rect | null = keptBounds(mask, photo.w, photo.h);
  if (!box) return null;
  const pixels = cutoutPixels(photo.rgba, mask, photo.w, box);
  return encodeSticker(pixels, box.w, box.h, {
    scale: (rgba, w, h, tw, th) => canvasScale(rgba, w, h, tw, th),
    encoder: canvasEncoder,
  }, STICKER_MAX_SIDE);
}
