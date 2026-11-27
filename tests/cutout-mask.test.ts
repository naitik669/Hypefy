import { describe, it, expect } from "vitest";
import {
  fitWithin,
  toModelInput,
  predictionToMask,
  paintSegment,
  keptBounds,
  cutoutPixels,
  applyMaskAlpha,
  MaskHistory,
} from "@/lib/cutout/mask";

/**
 * The cutout studio's pixel work, driven directly: every function here takes
 * plain arrays and returns plain arrays, so each guarantee is checked by
 * calling it, never by reading the source.
 */

function solid(w: number, h: number, rgb: [number, number, number]): Uint8ClampedArray {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) a.set([...rgb, 255], i * 4);
  return a;
}

describe("fitWithin", () => {
  it("shrinks the long side to the cap and keeps the shape", () => {
    expect(fitWithin(4000, 3000, 1024)).toEqual({ w: 1024, h: 768 });
    expect(fitWithin(3000, 4000, 1024)).toEqual({ w: 768, h: 1024 });
  });
  it("never enlarges a small photo", () => {
    expect(fitWithin(300, 200, 1024)).toEqual({ w: 300, h: 200 });
  });
});

describe("toModelInput", () => {
  it("is channels-first, divided by the brightest value and centred on 0.5", () => {
    // Left half pure red (200,0,0), right half (0,100,0): brightest is 200.
    const w = 4;
    const h = 2;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) px.set(x < 2 ? [200, 0, 0, 255] : [0, 100, 0, 255], (y * w + x) * 4);
    const t = toModelInput(px, w, h, 4);
    const plane = 16;
    expect(t.length).toBe(3 * plane);
    // Top-left pixel: red channel 200/200 - .5, green 0/200 - .5.
    expect(t[0]).toBeCloseTo(0.5);
    expect(t[plane]).toBeCloseTo(-0.5);
    // Top-right pixel: green channel 100/200 - .5 = 0.
    expect(t[plane + 3]).toBeCloseTo(0);
    expect(t[3]).toBeCloseTo(-0.5);
  });
  it("does not divide by zero on an all-black photo", () => {
    const t = toModelInput(solid(2, 2, [0, 0, 0]), 2, 2, 2);
    expect([...t].every((v) => v === -0.5)).toBe(true);
  });
});

describe("predictionToMask", () => {
  it("stretches the prediction by its own min and max", () => {
    // 2x2 prediction on an arbitrary scale: 3 lowest, 7 highest.
    const m = predictionToMask(new Float32Array([3, 7, 3, 7]), 2, 2, 2);
    expect([...m]).toEqual([0, 255, 0, 255]);
  });
  it("resizes to the photo's own size", () => {
    const m = predictionToMask(new Float32Array([0, 1, 0, 1]), 2, 6, 3);
    expect(m.length).toBe(18);
    expect(m[0]).toBe(0);
    expect(m[5]).toBe(255);
  });
  it("keeps nothing when the prediction is flat", () => {
    const m = predictionToMask(new Float32Array([0.4, 0.4, 0.4, 0.4]), 2, 2, 2);
    expect([...m]).toEqual([0, 0, 0, 0]);
  });
});

describe("paintSegment", () => {
  it("Keep paints a round dab of 255 around the point and nothing outside it", () => {
    const w = 11;
    const mask = new Uint8ClampedArray(w * w);
    paintSegment(mask, w, w, { x: 5.5, y: 5.5 }, { x: 5.5, y: 5.5 }, 2, 255);
    expect(mask[5 * w + 5]).toBe(255);
    expect(mask[5 * w + 7]).toBe(255);
    expect(mask[5 * w + 8]).toBe(0);
    // Round, not square: the corner at distance ~2.8 stays untouched.
    expect(mask[3 * w + 3]).toBe(0);
  });
  it("Erase writes 0 along the whole segment, not just its ends", () => {
    const w = 20;
    const mask = new Uint8ClampedArray(w * 5).fill(255);
    paintSegment(mask, w, 5, { x: 1, y: 2.5 }, { x: 18, y: 2.5 }, 1, 0);
    for (let x = 1; x < 18; x++) expect(mask[2 * w + x]).toBe(0);
    expect(mask[0]).toBe(255);
  });
  it("returns the touched rectangle, clipped to the picture", () => {
    const mask = new Uint8ClampedArray(100);
    expect(paintSegment(mask, 10, 10, { x: 0, y: 0 }, { x: 0, y: 0 }, 3, 255)).toEqual({ x: 0, y: 0, w: 4, h: 4 });
  });
  it("misses entirely when the finger is off the picture", () => {
    const mask = new Uint8ClampedArray(100);
    expect(paintSegment(mask, 10, 10, { x: -50, y: -50 }, { x: -40, y: -40 }, 3, 255)).toBeNull();
    expect(mask.every((v) => v === 0)).toBe(true);
  });
});

describe("keptBounds", () => {
  it("is the tight box round the kept pixels", () => {
    const w = 6;
    const mask = new Uint8ClampedArray(w * 5);
    mask[1 * w + 2] = 255;
    mask[3 * w + 4] = 200;
    mask[4 * w + 0] = 100; // below the threshold: not part of the sticker
    expect(keptBounds(mask, w, 5)).toEqual({ x: 2, y: 1, w: 3, h: 3 });
  });
  it("is null when nothing is kept", () => {
    expect(keptBounds(new Uint8ClampedArray(9).fill(127), 3, 3)).toBeNull();
  });
});

describe("cutoutPixels", () => {
  it("takes colour from the photo and alpha from the mask, cropped", () => {
    const rgba = solid(3, 1, [10, 20, 30]);
    const mask = new Uint8ClampedArray([0, 255, 128]);
    const out = cutoutPixels(rgba, mask, 3, { x: 1, y: 0, w: 2, h: 1 });
    expect([...out]).toEqual([10, 20, 30, 255, 10, 20, 30, 128]);
  });
  it("leaves no background colour behind a fully removed pixel", () => {
    const out = cutoutPixels(solid(1, 1, [200, 100, 50]), new Uint8ClampedArray([0]), 1, { x: 0, y: 0, w: 1, h: 1 });
    expect([...out]).toEqual([0, 0, 0, 0]);
  });
});

describe("applyMaskAlpha", () => {
  it("writes alpha only inside the rectangle and never touches colour", () => {
    const display = solid(2, 2, [9, 9, 9]);
    applyMaskAlpha(display, new Uint8ClampedArray([1, 2, 3, 4]), 2, { x: 1, y: 0, w: 1, h: 2 });
    expect([...display]).toEqual([9, 9, 9, 255, 9, 9, 9, 2, 9, 9, 9, 255, 9, 9, 9, 4]);
  });
});

describe("MaskHistory", () => {
  it("undo returns the mask as it was before the stroke, not a live reference", () => {
    const h = new MaskHistory();
    const mask = new Uint8ClampedArray([1, 2]);
    h.push(mask);
    mask[0] = 99;
    expect([...h.pop()!]).toEqual([1, 2]);
    expect(h.pop()).toBeNull();
  });
  it("forgets the oldest stroke past its limit", () => {
    const h = new MaskHistory(2);
    for (const v of [1, 2, 3]) h.push(new Uint8ClampedArray([v]));
    expect(h.size).toBe(2);
    expect(h.pop()![0]).toBe(3);
    expect(h.pop()![0]).toBe(2);
    expect(h.pop()).toBeNull();
  });
});
