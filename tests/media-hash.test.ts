import { describe, it, expect } from "vitest";
import {
  HASH_H,
  HASH_W,
  MATCH_DISTANCE,
  dhash,
  hammingDistance,
  isHash,
  looksLikeSameImage,
  toGrayscale,
} from "@/lib/media-hash";

/**
 * The hash that makes a takedown stick.
 *
 * What matters is not that the function returns a string — it is that the
 * string stays put when a picture is re-encoded and moves a long way when
 * the picture is a different one. A hash that is merely deterministic is
 * useless; a hash with no gap between "same" and "different" is worse than
 * useless, because a threshold drawn across it blocks innocent uploads.
 *
 * So these tests measure the gap.
 */

const SIZE = HASH_W * HASH_H;

/** A deterministic pseudo-random source, so a failure is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * A picture at a realistic size, before anything shrinks it.
 *
 * The first version of these fixtures built the 9x8 thumbnail directly and
 * added noise to it, which modelled nothing: a real thumbnail is an AVERAGE
 * of many source pixels, and that averaging is most of why a perceptual hash
 * survives re-encoding at all. Noise applied at thumbnail resolution is
 * roughly 8x harsher than the real thing, and the test said a re-encode
 * moved the hash by 19 bits when it actually moves it by one or two. Believed,
 * it would have argued for a dangerously loose threshold.
 */
const SCALE = 12;
const SRC_W = HASH_W * SCALE;
const SRC_H = HASH_H * SCALE;

/** Waves, blobs and an edge — enough structure to tell scenes apart. */
function scene(seed: number): Float64Array {
  const r = rng(seed * 2654435761);
  const waves = Array.from({ length: 3 }, () => ({ fx: r() * 0.9, fy: r() * 0.9, ph: r() * 6.28, amp: r() * 50 + 10 }));
  const blobs = Array.from({ length: 3 }, () => ({ cx: r() * SRC_W, cy: r() * SRC_H, rad: r() * 30 + 8, amp: (r() * 2 - 1) * 90 }));
  const edge = { x: r() * SRC_W, amp: (r() * 2 - 1) * 60 };
  const img = new Float64Array(SRC_W * SRC_H);
  for (let y = 0; y < SRC_H; y++) {
    for (let x = 0; x < SRC_W; x++) {
      let v = 128;
      for (const w of waves) v += w.amp * Math.sin(w.fx * x + w.fy * y + w.ph);
      for (const b of blobs) {
        const d = Math.hypot(x - b.cx, y - b.cy);
        v += b.amp * Math.exp(-(d * d) / (2 * b.rad * b.rad));
      }
      if (x > edge.x) v += edge.amp;
      img[y * SRC_W + x] = v;
    }
  }
  return img;
}

/** Box-average down to the hash thumbnail, as any resizer would. */
function thumbnail(img: Float64Array): Uint8Array {
  const g = new Uint8Array(SIZE);
  for (let y = 0; y < HASH_H; y++) {
    for (let x = 0; x < HASH_W; x++) {
      let sum = 0;
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) sum += img[(y * SCALE + dy) * SRC_W + (x * SCALE + dx)];
      }
      g[y * HASH_W + x] = Math.max(0, Math.min(255, sum / (SCALE * SCALE))) | 0;
    }
  }
  return g;
}

const hashOf = (img: Float64Array) => dhash(thumbnail(img));

/** Lossy re-encode: sensor and compression noise, at source resolution. */
function noisy(img: Float64Array, seed: number, amp: number): Float64Array {
  const r = rng(seed);
  const out = new Float64Array(img.length);
  for (let i = 0; i < img.length; i++) out[i] = img[i] + (r() * 2 - 1) * amp;
  return out;
}
/** Someone brightened it before reposting. */
function brighter(img: Float64Array, delta: number): Float64Array {
  return img.map((v) => v + delta) as Float64Array;
}
/** Or ran it through a filter that flattened the contrast. */
function contrast(img: Float64Array, k: number): Float64Array {
  return img.map((v) => 128 + (v - 128) * k) as Float64Array;
}

describe("dhash", () => {
  it("produces 16 hex characters — 64 bits", () => {
    const h = hashOf(scene(1));
    expect(isHash(h)).toBe(true);
    expect(h).toHaveLength(16);
  });

  it("is deterministic", () => {
    expect(hashOf(scene(7))).toBe(hashOf(scene(7)));
  });

  it("refuses a thumbnail of the wrong size rather than hashing garbage", () => {
    // Silently hashing a wrong-sized buffer would produce values that never
    // match anything, and the blocklist would quietly stop working.
    expect(() => dhash(new Uint8Array(SIZE - 1))).toThrow(/greyscale bytes/);
    expect(() => dhash(new Uint8Array(SIZE + 1))).toThrow();
  });

  it("reads brightness left-to-right, not right-to-left", () => {
    // A row that climbs has every comparison false; one that falls has every
    // comparison true. Getting this backwards still gives a stable hash, so
    // nothing else here would catch it.
    const rising = new Uint8Array(SIZE);
    const falling = new Uint8Array(SIZE);
    for (let y = 0; y < HASH_H; y++) {
      for (let x = 0; x < HASH_W; x++) {
        rising[y * HASH_W + x] = x * 25;
        falling[y * HASH_W + x] = (HASH_W - 1 - x) * 25;
      }
    }
    expect(dhash(rising)).toBe("0000000000000000");
    expect(dhash(falling)).toBe("ffffffffffffffff");
  });

  it("gives a flat image a hash of zero, and does not crash on it", () => {
    // No pixel is brighter than its neighbour, so every bit is 0. A blank
    // upload is a real thing and must not throw.
    expect(dhash(new Uint8Array(SIZE).fill(128))).toBe("0000000000000000");
  });
});

describe("hammingDistance", () => {
  it("is zero for a hash against itself", () => {
    const h = hashOf(scene(3));
    expect(hammingDistance(h, h)).toBe(0);
  });

  it("is 64 for exact opposites", () => {
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
  });

  it("counts single bits correctly", () => {
    expect(hammingDistance("0000000000000000", "0000000000000001")).toBe(1);
    expect(hammingDistance("0000000000000000", "000000000000000f")).toBe(4);
    expect(hammingDistance("0000000000000000", "8000000000000000")).toBe(1);
  });

  it("treats anything malformed as maximally different", () => {
    // The dangerous failure is a bad value reading as a MATCH, which would
    // block an upload for no reason. Never that direction.
    for (const bad of ["", "zzzz", "0000", "0000000000000000ff", "ABCDEF0123456789", null, undefined, 42]) {
      expect(hammingDistance(bad as string, "0000000000000000"), String(bad)).toBe(64);
      expect(hammingDistance("0000000000000000", bad as string), String(bad)).toBe(64);
    }
  });
});

describe("the gap between the same picture and a different one", () => {
  const SCENES = 120;
  const originals = Array.from({ length: SCENES }, (_, i) => scene(i + 1));
  const hashes = originals.map(hashOf);

  it("every scene gets its own hash — no collisions to hide behind", () => {
    expect(new Set(hashes).size).toBe(SCENES);
  });

  it("the typical re-encode moves the hash barely at all", () => {
    // The whole point: a phone re-encoding a JPEG must not defeat a takedown.
    // Mean, not worst, because the worst case is a deliberately brutal one.
    let total = 0;
    for (let i = 0; i < SCENES; i++) {
      total += hammingDistance(hashes[i], hashOf(noisy(originals[i], i * 7 + 1, 10)));
    }
    expect(total / SCENES).toBeLessThan(2);
  });

  it("and survives brightness and contrast changes", () => {
    for (let i = 0; i < SCENES; i++) {
      expect(hammingDistance(hashes[i], hashOf(brighter(originals[i], 20)))).toBeLessThanOrEqual(MATCH_DISTANCE);
      expect(hammingDistance(hashes[i], hashOf(contrast(originals[i], 0.85)))).toBeLessThanOrEqual(MATCH_DISTANCE);
    }
  });

  it("almost never puts two different pictures inside the threshold", () => {
    // This is the number that decides whether innocent uploads get blocked.
    let pairs = 0;
    let inside = 0;
    for (let a = 0; a < SCENES; a++) {
      for (let b = a + 1; b < SCENES; b++) {
        pairs++;
        if (hammingDistance(hashes[a], hashes[b]) <= MATCH_DISTANCE) inside++;
      }
    }
    expect(inside / pairs).toBeLessThan(0.001);
  });

  it("the threshold is not quietly loosened", () => {
    // Raising this is a decision about blocking innocent uploads, so it has
    // to argue with a test rather than slip past in a diff.
    expect(MATCH_DISTANCE).toBe(6);
  });
});

describe("looksLikeSameImage", () => {
  it("accepts at the threshold and refuses one bit past it", () => {
    const base = "0000000000000000";
    expect(looksLikeSameImage(base, "00000000000000ff", 8)).toBe(true);
    expect(looksLikeSameImage(base, "00000000000001ff", 8)).toBe(false);
  });

  it("refuses a malformed hash", () => {
    expect(looksLikeSameImage("not-a-hash", "0000000000000000")).toBe(false);
  });
});

describe("toGrayscale", () => {
  it("uses Rec. 601 luma, so it matches every other implementation", () => {
    // Red, green and blue at full strength are not equally bright, and a
    // naive average would make this test pass while the hashes disagreed
    // with every other tool.
    expect(Array.from(toGrayscale([255, 0, 0, 255]))).toEqual([76]);
    expect(Array.from(toGrayscale([0, 255, 0, 255]))).toEqual([149]);
    expect(Array.from(toGrayscale([0, 0, 255, 255]))).toEqual([29]);
    expect(Array.from(toGrayscale([255, 255, 255, 255]))).toEqual([255]);
  });

  it("reads a fully transparent pixel as white, not black", () => {
    // A PNG with alpha is nearly always a graphic on a transparent ground.
    // Treating that ground as black inverts every gradient at its edge, and
    // the same logo would hash differently depending on the encoder.
    expect(Array.from(toGrayscale([0, 0, 0, 0]))).toEqual([255]);
    expect(Array.from(toGrayscale([255, 255, 255, 0]))).toEqual([255]);
  });

  it("returns one byte per pixel", () => {
    const rgba = new Uint8ClampedArray(SIZE * 4).fill(200);
    expect(toGrayscale(rgba)).toHaveLength(SIZE);
  });
});
