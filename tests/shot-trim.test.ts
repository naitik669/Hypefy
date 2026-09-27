import { describe, it, expect } from "vitest";
import {
  MAX_SHOT_SECS,
  MIN_SHOT_SECS,
  needsTrim,
  tooShort,
  defaultTrim,
  clampTrim,
  trimToStore,
  playbackWindow,
  fmtSecs,
} from "@/lib/shot-trim";

/**
 * The trim is the only thing standing between the Shots feed and a
 * three-minute clip, and it is enforced in three places that have to agree:
 * these rules, the database constraint, and the player's loop. Anything wrong
 * here either blocks a legal Shot or freezes the feed on a zero-length loop.
 */

describe("needsTrim / tooShort", () => {
  it("lets a clip inside the cap through untouched", () => {
    expect(needsTrim(MAX_SHOT_SECS)).toBe(false);
    expect(needsTrim(12)).toBe(false);
  });

  it("catches a clip over the cap", () => {
    expect(needsTrim(MAX_SHOT_SECS + 0.1)).toBe(true);
    expect(needsTrim(204)).toBe(true);
  });

  it("rejects a clip too short to be a Shot, and any nonsense duration", () => {
    expect(tooShort(0.4)).toBe(true);
    expect(tooShort(MIN_SHOT_SECS)).toBe(false);
    for (const bad of [0, -1, NaN, Infinity]) expect(tooShort(bad)).toBe(true);
  });

  it("treats a nonsense duration as not needing a trim, so it fails on length instead", () => {
    for (const bad of [NaN, Infinity]) expect(needsTrim(bad)).toBe(false);
  });
});

describe("defaultTrim", () => {
  it("selects a short clip whole", () => {
    expect(defaultTrim(12)).toEqual({ start: 0, end: 12 });
  });

  it("opens a long clip on its first allowed minute", () => {
    expect(defaultTrim(204)).toEqual({ start: 0, end: MAX_SHOT_SECS });
  });

  it("survives a duration that never loaded", () => {
    expect(defaultTrim(0)).toEqual({ start: 0, end: 0 });
    expect(defaultTrim(NaN)).toEqual({ start: 0, end: 0 });
  });
});

describe("clampTrim", () => {
  it("leaves a legal selection alone", () => {
    expect(clampTrim(10, 40, 204)).toEqual({ start: 10, end: 40 });
  });

  it("never runs past the clip", () => {
    const t = clampTrim(190, 400, 204);
    expect(t.end).toBeLessThanOrEqual(204);
    expect(t.start).toBeGreaterThanOrEqual(0);
  });

  it("never runs before the start", () => {
    expect(clampTrim(-30, 20, 204).start).toBe(0);
  });

  it("keeps the window at least the minimum, rather than letting it collapse", () => {
    const t = clampTrim(30, 30, 204);
    expect(t.end - t.start).toBeGreaterThanOrEqual(MIN_SHOT_SECS);
  });

  it("pushes the end along when the start is dragged past it", () => {
    const t = clampTrim(50, 45, 204);
    expect(t.end).toBeGreaterThan(t.start);
  });

  it("gives way at the far edge instead of overrunning it", () => {
    // Dragging the start to the very end of a clip: the window must still fit.
    const t = clampTrim(204, 204, 204);
    expect(t.end).toBeLessThanOrEqual(204);
    expect(t.end - t.start).toBeGreaterThanOrEqual(MIN_SHOT_SECS);
  });

  it("never returns a window longer than a Shot may be", () => {
    for (const [s, e, d] of [[0, 300, 400], [10, 900, 900], [0, 61, 204]] as const) {
      const t = clampTrim(s, e, d);
      expect(t.end - t.start).toBeLessThanOrEqual(MAX_SHOT_SECS + 0.001);
    }
  });

  it("handles a clip shorter than the minimum without inverting", () => {
    const t = clampTrim(0, 5, 0.5);
    expect(t.end).toBeGreaterThanOrEqual(t.start);
    expect(t.end).toBeLessThanOrEqual(0.5);
  });
});

describe("trimToStore", () => {
  it("stores nothing when the whole clip is selected", () => {
    expect(trimToStore({ start: 0, end: 12 }, 12)).toEqual({ trim_start: null, trim_end: null });
  });

  it("ignores a handle a hair short of the edge", () => {
    expect(trimToStore({ start: 0.0004, end: 11.9995 }, 12)).toEqual({
      trim_start: null,
      trim_end: null,
    });
  });

  it("stores only the side that actually moved", () => {
    expect(trimToStore({ start: 3, end: 12 }, 12)).toEqual({ trim_start: 3, trim_end: null });
    expect(trimToStore({ start: 0, end: 8 }, 12)).toEqual({ trim_start: null, trim_end: 8 });
  });

  it("stores both when both moved", () => {
    expect(trimToStore({ start: 3, end: 8 }, 12)).toEqual({ trim_start: 3, trim_end: 8 });
  });

  it("stores nothing for a clip whose duration never loaded", () => {
    expect(trimToStore({ start: 3, end: 8 }, 0)).toEqual({ trim_start: null, trim_end: null });
  });

  it("only ever stores values the database constraint accepts", () => {
    const { trim_start, trim_end } = trimToStore({ start: 3, end: 8 }, 12);
    expect(trim_start!).toBeGreaterThanOrEqual(0);
    expect(trim_end!).toBeGreaterThan(trim_start!);
  });
});

describe("playbackWindow", () => {
  it("plays an untrimmed Shot whole", () => {
    expect(playbackWindow({})).toEqual({ start: 0, end: null });
    expect(playbackWindow({ trim_start: null, trim_end: null })).toEqual({ start: 0, end: null });
  });

  it("reads a stored trim back", () => {
    expect(playbackWindow({ trim_start: 3, trim_end: 8 })).toEqual({ start: 3, end: 8 });
  });

  it("handles one-sided trims", () => {
    expect(playbackWindow({ trim_start: 3 })).toEqual({ start: 3, end: null });
    expect(playbackWindow({ trim_end: 8 })).toEqual({ start: 0, end: 8 });
  });

  it("ignores a backwards range rather than looping on nothing", () => {
    // The constraint rejects this, but a hand-edited row must not freeze the feed.
    expect(playbackWindow({ trim_start: 8, trim_end: 3 })).toEqual({ start: 8, end: null });
    expect(playbackWindow({ trim_start: 5, trim_end: 5 })).toEqual({ start: 5, end: null });
  });
});

describe("fmtSecs", () => {
  it("formats as m:ss", () => {
    expect(fmtSecs(0)).toBe("0:00");
    expect(fmtSecs(7)).toBe("0:07");
    expect(fmtSecs(65)).toBe("1:05");
    expect(fmtSecs(204)).toBe("3:24");
  });

  it("does not print NaN at someone", () => {
    for (const bad of [NaN, -5, Infinity]) expect(fmtSecs(bad)).toMatch(/^\d+:\d\d$/);
  });
});
