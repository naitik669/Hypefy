import { describe, it, expect } from "vitest";
import {
  arcPath,
  areaPath,
  bars,
  labelIndices,
  linePath,
  niceMax,
  slices,
  slotCentres,
  ticks,
  yOf,
  type Box,
} from "@/lib/chart-scale";

/**
 * The maths behind the charts.
 *
 * Hypefy ships no charting library and this does not add one: the app
 * lands on phones through Capacitor, where ~100kB gzipped of chart runtime
 * is a real cost for a bar and a line, and InsightsChart already proved
 * the hand-rolled shape. What it lacked was testable maths — its scaling
 * was written inline against a 0-100 viewBox, so nothing could check it.
 *
 * Everything here is SVG coordinates, where y grows DOWNWARD. That is the
 * commonest source of upside-down charts, so it gets its own tests.
 */

const box: Box = { x: 10, y: 20, width: 100, height: 50 };

describe("a readable axis", () => {
  it("rounds the top up to something divisible in your head", () => {
    // An axis topped at the data's exact maximum puts the tallest bar
    // flush against the ceiling and labels it 437.
    expect(niceMax(437)).toBe(500);
    expect(niceMax(1)).toBe(1);
    expect(niceMax(11)).toBe(20);
    expect(niceMax(23)).toBe(25);
    expect(niceMax(1200)).toBe(2000);
  });

  it("and survives nothing to draw", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-5)).toBe(1);
    expect(niceMax(NaN)).toBe(1);
  });

  it("always starts ticks at zero", () => {
    // A cropped baseline exaggerates differences. Not something to do to
    // somebody about their own numbers.
    const t = ticks(437, 4);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBe(500);
    expect(t).toHaveLength(5);
  });
});

describe("y grows downward", () => {
  it("zero sits on the floor and the max on the ceiling", () => {
    expect(yOf(0, 100, box)).toBe(box.y + box.height); // 70, the bottom
    expect(yOf(100, 100, box)).toBe(box.y); // 20, the top
  });

  it("so a bigger value is a SMALLER y", () => {
    // The upside-down-chart test.
    expect(yOf(80, 100, box)).toBeLessThan(yOf(20, 100, box));
  });

  it("half way up is half way up", () => {
    expect(yOf(50, 100, box)).toBe(45); // 20 + 50 - 25
  });

  it("clamps rather than drawing outside the box", () => {
    expect(yOf(500, 100, box)).toBe(box.y);
    expect(yOf(-10, 100, box)).toBe(box.y + box.height);
  });

  it("and scales against the NICE max, not the raw one", () => {
    // Otherwise the gridline labelled 500 and the bar of height 437 would
    // disagree about where the top is.
    expect(yOf(437, 437, box)).toBe(yOf(437, 500, box));
  });
});

describe("bars across a box", () => {
  it("fill the width exactly, whatever the count", () => {
    for (const n of [1, 7, 30]) {
      const b = bars(n, box);
      expect(b).toHaveLength(n);
      const last = b[b.length - 1];
      // First bar starts inside the box, last ends inside it.
      expect(b[0].x).toBeGreaterThanOrEqual(box.x);
      expect(last.x + last.width).toBeLessThanOrEqual(box.x + box.width + 0.001);
    }
  });

  it("are evenly spaced", () => {
    const b = bars(5, box);
    const gaps = b.slice(1).map((v, i) => v.x - b[i].x);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6);
  });

  it("use a proportional gap, so thirty days do not become hairlines", () => {
    // A fixed pixel gap would leave 30 bars thinner than the space between.
    const seven = bars(7, box)[0].width;
    const thirty = bars(30, box)[0].width;
    expect(thirty).toBeLessThan(seven);
    // Still a bar, not a line: most of its slot.
    expect(thirty).toBeGreaterThan((box.width / 30) * 0.5);
  });

  it("never produce a bar of no width", () => {
    expect(bars(200, box)[0].width).toBeGreaterThan(0);
    expect(bars(0, box)).toEqual([]);
  });
});

describe("lines over the same scale", () => {
  it("sit on the centre of each bar slot", () => {
    const centres = slotCentres(4, box);
    const b = bars(4, box);
    centres.forEach((c, i) => expect(c).toBeCloseTo(b[i].x + b[i].width / 2, 6));
  });

  it("start with a move and continue with lines", () => {
    const d = linePath([1, 2, 3], 3, box);
    expect(d.startsWith("M")).toBe(true);
    expect((d.match(/L/g) ?? [])).toHaveLength(2);
  });

  it("and an area closes back down to the baseline", () => {
    const d = areaPath([1, 2, 3], 3, box);
    expect(d.endsWith("Z")).toBe(true);
    // The closing corners are on the floor of the box.
    expect(d).toContain(String(box.y + box.height));
  });

  it("nothing to draw draws nothing", () => {
    expect(linePath([], 10, box)).toBe("");
    expect(areaPath([], 10, box)).toBe("");
  });
});

describe("donut segments", () => {
  it("start at twelve o'clock", () => {
    // Where the eye starts, and where every pie chart ever seen starts.
    const d = arcPath(50, 50, 20, 0, 0.25);
    expect(d.startsWith("M50 30")).toBe(true);
  });

  it("set the large-arc flag past the halfway mark", () => {
    expect(arcPath(50, 50, 20, 0, 0.4)).toContain("0 0 1");
    expect(arcPath(50, 50, 20, 0, 0.6)).toContain("0 1 1");
  });

  it("draw a whole circle as two arcs, not one", () => {
    // A single 360-degree arc has identical endpoints and renders as
    // nothing at all — the classic empty full-circle donut.
    const d = arcPath(50, 50, 20, 0, 1);
    expect((d.match(/A/g) ?? [])).toHaveLength(2);
    expect(d).not.toBe("");
  });

  it("and an empty segment is empty", () => {
    expect(arcPath(50, 50, 20, 0.5, 0.5)).toBe("");
    expect(arcPath(50, 50, 20, 0.8, 0.2)).toBe("");
  });

  it("slices add up to the whole and run in order", () => {
    const s = slices([3, 1]);
    expect(s[0].start).toBe(0);
    expect(s[0].end).toBeCloseTo(0.75, 6);
    expect(s[1].start).toBeCloseTo(0.75, 6);
    expect(s[1].end).toBeCloseTo(1, 6);
  });

  it("and nothing at all is not a divide by zero", () => {
    expect(slices([0, 0])).toEqual([
      { start: 0, end: 0 },
      { start: 0, end: 0 },
    ]);
  });
});

describe("labels that do not collide", () => {
  it("prints them all when there is room", () => {
    expect(labelIndices(4, 5)).toEqual([0, 1, 2, 3]);
  });

  it("thins them out when there is not", () => {
    // 30 days at phone width is one label every ~11px.
    const out = labelIndices(30, 5);
    expect(out.length).toBeLessThanOrEqual(5);
  });

  it("and always keeps the two ends, which are what people look for", () => {
    const out = labelIndices(30, 5);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(29);
  });

  it("handles an empty series", () => {
    expect(labelIndices(0)).toEqual([]);
  });
});
