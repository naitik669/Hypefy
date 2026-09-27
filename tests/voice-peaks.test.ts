import { describe, it, expect } from "vitest";
import { summarisePeaks, resamplePeaks, voiceWidth, barCount, PEAK_COUNT, PEAK_MAX } from "@/lib/voice-peaks";

/**
 * The waveform is the one part of a voice note that claims to say something
 * about the audio, so the arithmetic under it has to be right — a plausible
 * looking wrong shape is worse than the old honest-looking decoration.
 */

describe("summarisePeaks", () => {
  it("returns nothing when nothing was recorded", () => {
    expect(summarisePeaks([])).toEqual([]);
  });

  it("returns exactly the stored number of samples", () => {
    expect(summarisePeaks([1, 2, 3], 48)).toHaveLength(48);
    expect(summarisePeaks(Array(5000).fill(7))).toHaveLength(PEAK_COUNT);
  });

  it("scales the loudest moment to the top", () => {
    const out = summarisePeaks([10, 20, 30, 40], 4);
    expect(Math.max(...out)).toBe(PEAK_MAX);
  });

  it("keeps a quiet note readable rather than a flat line", () => {
    // Recorded far from the mic: everything is tiny, but the shape is there.
    const quiet = summarisePeaks([2, 4, 2, 8, 2, 4], 6);
    expect(Math.max(...quiet)).toBe(PEAK_MAX);
    expect(Math.min(...quiet)).toBeLessThan(PEAK_MAX);
  });

  it("keeps silence flat instead of dividing by zero", () => {
    const out = summarisePeaks([0, 0, 0, 0], 4);
    expect(out).toEqual([0, 0, 0, 0]);
  });

  it("puts a pause in the middle where the pause was", () => {
    const loud = Array(20).fill(90);
    const silence = Array(20).fill(0);
    const out = summarisePeaks([...loud, ...silence, ...loud], 3);
    expect(out[1]).toBeLessThan(out[0]);
    expect(out[1]).toBeLessThan(out[2]);
  });

  it("averages a bucket rather than taking its loudest moment", () => {
    // One click among quiet samples must not make the whole bucket full height.
    const out = summarisePeaks([100, 0, 0, 0, 50, 50, 50, 50], 2);
    expect(out[0]).toBeLessThan(out[1]);
  });

  it("never exceeds the maximum", () => {
    const out = summarisePeaks([500, 1000, 250], 3);
    expect(Math.max(...out)).toBeLessThanOrEqual(PEAK_MAX);
  });
});

describe("resamplePeaks", () => {
  it("returns nothing for an empty note", () => {
    expect(resamplePeaks([], 20)).toEqual([]);
    expect(resamplePeaks([1, 2, 3], 0)).toEqual([]);
  });

  it("returns exactly the asked-for number of bars", () => {
    expect(resamplePeaks(Array(48).fill(50), 21)).toHaveLength(21);
    expect(resamplePeaks(Array(48).fill(50), 43)).toHaveLength(43);
  });

  it("passes a matching count straight through", () => {
    const peaks = [1, 2, 3, 4];
    expect(resamplePeaks(peaks, 4)).toEqual(peaks);
  });

  it("repeats rather than inventing detail when asked for more", () => {
    expect(resamplePeaks([0, 100], 4)).toEqual([0, 0, 100, 100]);
  });

  it("keeps the loud half loud when shrinking", () => {
    const out = resamplePeaks([...Array(24).fill(0), ...Array(24).fill(100)], 2);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(100);
  });
});

describe("voiceWidth", () => {
  it("gives a short note a narrow bubble and a long one a wide bubble", () => {
    expect(voiceWidth(2)).toBeLessThan(voiceWidth(30));
  });

  it("stops growing, so a two-minute note cannot run off the screen", () => {
    expect(voiceWidth(120)).toBe(voiceWidth(600));
    expect(voiceWidth(120)).toBeLessThanOrEqual(262);
  });

  it("survives a missing or nonsense duration", () => {
    // Old notes stored before durations were kept, and anything corrupt.
    for (const bad of [0, -5, NaN, Infinity]) {
      expect(voiceWidth(bad)).toBe(voiceWidth(0));
      expect(Number.isFinite(voiceWidth(bad))).toBe(true);
    }
  });
});

describe("barCount", () => {
  it("asks for more bars as the bubble grows", () => {
    expect(barCount(voiceWidth(2))).toBeLessThan(barCount(voiceWidth(120)));
  });

  it("never asks for more bars than were stored", () => {
    expect(barCount(1000)).toBeLessThanOrEqual(PEAK_COUNT);
  });

  it("keeps enough bars to read at the narrowest bubble", () => {
    expect(barCount(voiceWidth(1))).toBeGreaterThanOrEqual(12);
  });
});
