import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every <video> sets a poster. Without one, Android's WebView paints its own
 * grey play-button placeholder while the first frame loads, which is what
 * showed on Shots tiles before they loaded (see src/lib/blank-poster.ts).
 */

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/** The opening tag starting at `at`, skipping braces and quotes. */
function openingTag(src: string, at: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = at + 6; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (depth === 0 && (c === '"' || c === "'" || c === "`")) { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(at, i + 1);
  }
  return src.slice(at);
}

describe("video posters", () => {
  it("no <video> in the app is left without a poster", () => {
    const missing: string[] = [];
    for (const file of tsxFiles("src")) {
      const src = readFileSync(file, "utf8");
      let at = src.indexOf("<video");
      while (at >= 0) {
        if (/\s/.test(src[at + 6]) && !openingTag(src, at).includes("poster=")) {
          missing.push(`${file}:${src.slice(0, at).split("\n").length}`);
        }
        at = src.indexOf("<video", at + 6);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("choosing a frame worth keeping", () => {
  it("tries the chosen cover first, then further into the clip", async () => {
    const { posterTimes } = await import("@/lib/video-poster");
    const times = posterTimes(20, 3);
    expect(times[0]).toBe(3);
    expect(times.length).toBeGreaterThan(1);
    // The fallbacks walk in rather than clustering at the start, where a
    // phone recording is usually black.
    expect(Math.max(...times)).toBeGreaterThan(10);
  });

  it("never seeks past the end, which hangs the seek", async () => {
    const { posterTimes } = await import("@/lib/video-poster");
    for (const t of posterTimes(4, 99)) expect(t).toBeLessThanOrEqual(4);
    for (const t of posterTimes(4, -3)) expect(t).toBeGreaterThanOrEqual(0);
  });

  it("still has somewhere to look when the clip has no duration", async () => {
    const { posterTimes } = await import("@/lib/video-poster");
    // What a MediaRecorder webm reports until it is remuxed.
    expect(posterTimes(Infinity, null)).toEqual([0.5]);
    expect(posterTimes(Number.NaN, 2)).toEqual([2]);
  });

  it("asks for each time once", async () => {
    const { posterTimes } = await import("@/lib/video-poster");
    const times = posterTimes(2, 0.5);
    expect(new Set(times).size).toBe(times.length);
  });
});

describe("telling a picture from a black frame", () => {
  const frame = (fill: (i: number) => [number, number, number], w = 40, h = 40) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const [r, g, b] = fill(i);
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    }
    return { data, width: w, height: h };
  };

  it("calls a black frame black", async () => {
    const { isBlankFrame } = await import("@/lib/video-poster");
    expect(isBlankFrame(frame(() => [0, 0, 0]))).toBe(true);
    // Sensor noise in an otherwise black frame is still black.
    expect(isBlankFrame(frame(() => [3, 2, 4]))).toBe(true);
  });

  it("calls anything with light in it a picture", async () => {
    const { isBlankFrame } = await import("@/lib/video-poster");
    expect(isBlankFrame(frame(() => [90, 90, 90]))).toBe(false);
    // A mostly dark night shot with one lit window is a picture.
    expect(isBlankFrame(frame((i) => (i === 820 ? [255, 240, 180] : [0, 0, 0])))).toBe(false);
  });

  it("treats an empty frame as nothing worth keeping", async () => {
    const { isBlankFrame } = await import("@/lib/video-poster");
    expect(isBlankFrame({ data: [], width: 0, height: 0 })).toBe(true);
  });
});
