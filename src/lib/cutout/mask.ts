/**
 * The cutout studio's pixel work, kept free of the DOM so it can be driven
 * from a test: turning the model's prediction into an alpha mask, painting
 * on that mask with a finger, finding what is left, and laying it over the
 * photo's colours.
 *
 * A mask is one byte per pixel, row-major, 0 = gone and 255 = kept.
 */

/** The model's square input. ISNet general-use is trained at 1024. */
export const MODEL_SIZE = 1024;

/** A mask value at or above this counts as part of the sticker. */
export const KEEP_THRESHOLD = 128;

export type Rect = { x: number; y: number; w: number; h: number };

/** Scale (w, h) down, never up, so the longer side is at most `max`. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= max) return { w, h };
  const s = max / long;
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/**
 * RGBA pixels → the model's input tensor: 1×3×S×S, channels first, resized
 * bilinearly to S×S, divided by the image's brightest channel value and
 * centred on 0.5 (mean 0.5, std 1 — the normalisation ISNet was trained with).
 */
export function toModelInput(rgba: Uint8ClampedArray, w: number, h: number, size = MODEL_SIZE): Float32Array {
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  let max = 1;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] > max) max = rgba[i];
    if (rgba[i + 1] > max) max = rgba[i + 1];
    if (rgba[i + 2] > max) max = rgba[i + 2];
  }
  const sx = w / size;
  const sy = h / size;
  for (let y = 0; y < size; y++) {
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), h - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, h - 1);
    const ty = fy - y0;
    for (let x = 0; x < size; x++) {
      const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), w - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, w - 1);
      const tx = fx - x0;
      const o = y * size + x;
      for (let c = 0; c < 3; c++) {
        const a = rgba[(y0 * w + x0) * 4 + c];
        const b = rgba[(y0 * w + x1) * 4 + c];
        const d = rgba[(y1 * w + x0) * 4 + c];
        const e = rgba[(y1 * w + x1) * 4 + c];
        const top = a + (b - a) * tx;
        const bot = d + (e - d) * tx;
        out[c * plane + o] = (top + (bot - top) * ty) / max - 0.5;
      }
    }
  }
  return out;
}

/**
 * The model's raw prediction (S×S floats on no fixed scale) → a mask the
 * size of the photo. The prediction is stretched to 0..1 by its own minimum
 * and maximum first, as the model's reference code does: its absolute values
 * mean nothing, only where each pixel sits between the two.
 */
export function predictionToMask(pred: Float32Array, size: number, w: number, h: number): Uint8ClampedArray {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pred.length; i++) {
    const v = pred[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const range = hi - lo;
  const mask = new Uint8ClampedArray(w * h);
  // A flat prediction carries no subject at all: nothing is kept. (Removing
  // this line changes no result — a zero range gives NaN, which a clamped
  // array stores as 0 — so its test proves the outcome, not the guard.)
  if (!(range > 1e-6)) return mask;
  const sx = size / w;
  const sy = size / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), size - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, size - 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), size - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, size - 1);
      const tx = fx - x0;
      const a = pred[y0 * size + x0];
      const b = pred[y0 * size + x1];
      const d = pred[y1 * size + x0];
      const e = pred[y1 * size + x1];
      const top = a + (b - a) * tx;
      const bot = d + (e - d) * tx;
      mask[y * w + x] = Math.round(((top + (bot - top) * ty - lo) / range) * 255);
    }
  }
  return mask;
}

/**
 * Paint one finger movement onto the mask: every pixel within `radius` of
 * the segment from `a` to `b` becomes `value` (255 Keep, 0 Erase). Returns
 * the rectangle that may have changed, so the screen only redraws that, or
 * null when the segment missed the picture entirely.
 */
export function paintSegment(
  mask: Uint8ClampedArray,
  w: number,
  h: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
  radius: number,
  value: 0 | 255,
): Rect | null {
  const r = Math.max(0.5, radius);
  const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - r));
  const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - r));
  const x1 = Math.min(w - 1, Math.ceil(Math.max(a.x, b.x) + r));
  const y1 = Math.min(h - 1, Math.ceil(Math.max(a.y, b.y) + r));
  if (x0 > x1 || y0 > y1) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      // Distance from the pixel centre to the nearest point of the segment.
      let t = len2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = a.x + t * dx - px;
      const cy = a.y + t * dy - py;
      if (cx * cx + cy * cy <= r2) mask[y * w + x] = value;
    }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The smallest rectangle holding every kept pixel, or null if none is. */
export function keptBounds(mask: Uint8ClampedArray, w: number, h: number): Rect | null {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x] >= KEEP_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * The photo's colours with the mask as their alpha, cropped to `crop`.
 * Pixels the mask removed keep no colour, so nothing of the background can
 * be recovered from the saved file by stripping its alpha.
 */
export function cutoutPixels(rgba: Uint8ClampedArray, mask: Uint8ClampedArray, w: number, crop: Rect): Uint8ClampedArray {
  const out = new Uint8ClampedArray(crop.w * crop.h * 4);
  for (let y = 0; y < crop.h; y++) {
    for (let x = 0; x < crop.w; x++) {
      const s = (crop.y + y) * w + (crop.x + x);
      const d = (y * crop.w + x) * 4;
      const alpha = mask[s];
      if (alpha === 0) continue;
      out[d] = rgba[s * 4];
      out[d + 1] = rgba[s * 4 + 1];
      out[d + 2] = rgba[s * 4 + 2];
      out[d + 3] = alpha;
    }
  }
  return out;
}

/**
 * Write the mask into the alpha channel of a display buffer (an ImageData's
 * data) over `rect`, leaving its colours alone. This is what keeps a finger
 * stroke cheap: only the painted rectangle is touched and redrawn.
 */
export function applyMaskAlpha(display: Uint8ClampedArray, mask: Uint8ClampedArray, w: number, rect: Rect): void {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = y * w + x;
      display[i * 4 + 3] = mask[i];
    }
  }
}

/**
 * Undo history for the mask: one snapshot per finished stroke, the oldest
 * dropped past `limit` so a long edit cannot grow memory without bound.
 */
export class MaskHistory {
  private stack: Uint8ClampedArray[] = [];
  constructor(private readonly limit = 20) {}
  /** Call before a stroke changes the mask. */
  push(mask: Uint8ClampedArray): void {
    this.stack.push(mask.slice());
    if (this.stack.length > this.limit) this.stack.shift();
  }
  /** The mask as it was before the last stroke, or null if there is none. */
  pop(): Uint8ClampedArray | null {
    return this.stack.pop() ?? null;
  }
  get size(): number {
    return this.stack.length;
  }
  clear(): void {
    this.stack = [];
  }
}
