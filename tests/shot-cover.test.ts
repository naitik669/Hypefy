import { describe, it, expect } from "vitest";
import { frameTimes } from "@/components/post/ShotCoverPicker";

/**
 * Which moments get offered as a Shot's cover. Getting this wrong is quiet:
 * the strip still renders, it just offers six frames of a black lead-in.
 */
describe("frameTimes", () => {
  it("offers the asked-for number of frames", () => {
    expect(frameTimes(12, 6)).toHaveLength(6);
    expect(frameTimes(12, 3)).toHaveLength(3);
  });

  it("spaces them evenly across the clip", () => {
    const t = frameTimes(12, 6);
    const gaps = t.slice(1).map((v, i) => +(v - t[i]).toFixed(4));
    expect(new Set(gaps).size).toBe(1);
  });

  it("avoids both ends", () => {
    // The first frame of a phone recording is usually black or a blur, and
    // the last is usually the hand coming back for the button.
    const t = frameTimes(10, 5);
    expect(t[0]).toBeGreaterThan(0);
    expect(t[t.length - 1]).toBeLessThan(10);
  });

  it("never seeks past the end", () => {
    // A currentTime beyond duration never fires onseeked, so the strip would
    // hang on that frame until the bail timeout.
    for (const d of [0.4, 1, 3.7, 60]) {
      for (const t of frameTimes(d)) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(d);
      }
    }
  });

  it("survives a very short clip", () => {
    const t = frameTimes(0.3, 6);
    expect(t).toHaveLength(6);
    expect(t.every((x) => x >= 0 && x < 0.3)).toBe(true);
  });

  it("degrades to a single frame when the duration is unknown", () => {
    // Browsers report NaN or Infinity for duration on some streams; asking
    // for six frames of an unknown clip is six guaranteed failed seeks.
    expect(frameTimes(NaN)).toEqual([0]);
    expect(frameTimes(Infinity)).toEqual([0]);
    expect(frameTimes(0)).toEqual([0]);
    expect(frameTimes(-5)).toEqual([0]);
  });
});
