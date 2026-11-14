/**
 * The arithmetic behind the charts, with no SVG in it.
 *
 * Hypefy ships no charting library and this does not add one. The app is
 * wrapped in Capacitor and lands on phones, where ~100kB gzipped of chart
 * runtime is a real cost for drawing a bar and a line; and the existing
 * InsightsChart already proved the shape — a hand-rolled SVG with a rect
 * per day. What that file did not have was testable maths, because the
 * scaling was written inline against a 0-100 viewBox.
 *
 * So: the numbers live here, pure, and the components in
 * components/charts/ do nothing but turn them into elements. Everything
 * below is in SVG coordinates, where y grows downward — the single most
 * common source of upside-down charts, and the reason yOf exists rather
 * than each component doing its own subtraction.
 */

export type Point = { label: string; value: number };

/** A drawing area inside an SVG: where the plot starts and how big it is. */
export type Box = { x: number; y: number; width: number; height: number };

/**
 * A round number at or above `max`, for the top of an axis.
 *
 * An axis topped at the data's exact maximum puts the tallest bar flush
 * against the ceiling and labels it 437, which reads as a bug. Rounding up
 * to 1, 2, 2.5 or 5 times a power of ten gives gridlines people can divide
 * in their head.
 */
export function niceMax(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const pow = Math.pow(10, exp);
  const frac = max / pow;
  const step = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  return step * pow;
}

/**
 * Tick values from zero to a nice maximum, inclusive of both ends.
 *
 * Always starts at zero: a bar chart with a cropped baseline exaggerates
 * differences, which is the oldest way to mislead with a chart and not
 * something to do to somebody about their own numbers.
 */
export function ticks(max: number, count = 4): number[] {
  const top = niceMax(max);
  const n = Math.max(1, Math.floor(count));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push((top / n) * i);
  return out;
}

/**
 * Where a value sits vertically, in SVG coordinates.
 *
 * Zero is the bottom of the box and `max` is the top, which is the
 * opposite of how y runs — hence the subtraction being here, once,
 * instead of in every component.
 */
export function yOf(value: number, max: number, box: Box): number {
  const top = niceMax(max);
  if (top <= 0) return box.y + box.height;
  const clamped = Math.min(Math.max(value, 0), top);
  return box.y + box.height - (clamped / top) * box.height;
}

/**
 * Evenly spaced bars across a box, each with a gap either side.
 *
 * The gap is a fraction of the slot rather than a pixel count, so thirty
 * days and seven days both look deliberate instead of the thirty becoming
 * hairlines with the same 4px gap between them.
 */
export function bars(count: number, box: Box, gapFraction = 0.25): { x: number; width: number }[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const slot = box.width / n;
  const gap = Math.min(Math.max(gapFraction, 0), 0.9);
  const width = Math.max(1, slot * (1 - gap));
  const pad = (slot - width) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: box.x + i * slot + pad, width }));
}

/** The centre of each bar slot, for a line drawn over the same scale. */
export function slotCentres(count: number, box: Box): number[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const slot = box.width / n;
  return Array.from({ length: n }, (_, i) => box.x + i * slot + slot / 2);
}

/**
 * An SVG path through a series.
 *
 * Straight segments, not a spline: a curve through daily counts invents
 * values between the days that nobody measured, and on a chart of "views
 * per day" the space between two points is not a smooth anything.
 */
export function linePath(values: number[], max: number, box: Box): string {
  if (values.length === 0) return "";
  const xs = slotCentres(values.length, box);
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${round(xs[i])} ${round(yOf(v, max, box))}`)
    .join(" ");
}

/** The same line, closed down to the baseline, for a filled area underneath. */
export function areaPath(values: number[], max: number, box: Box): string {
  if (values.length === 0) return "";
  const xs = slotCentres(values.length, box);
  const base = box.y + box.height;
  const line = linePath(values, max, box);
  return `${line} L${round(xs[xs.length - 1])} ${round(base)} L${round(xs[0])} ${round(base)} Z`;
}

/**
 * One segment of a donut, as a path.
 *
 * Starts at twelve o'clock and runs clockwise, because that is where a
 * reader's eye starts and every pie they have ever seen does the same.
 * A segment covering the whole circle is drawn as two arcs: a single arc
 * of exactly 360 degrees has identical start and end points and renders
 * as nothing at all.
 */
export function arcPath(
  cx: number,
  cy: number,
  radius: number,
  startFraction: number,
  endFraction: number,
): string {
  const from = clamp01(startFraction);
  const to = clamp01(endFraction);
  if (to <= from) return "";
  if (to - from >= 1) {
    // Two half circles, for the reason above.
    return [
      `M${round(cx)} ${round(cy - radius)}`,
      `A${round(radius)} ${round(radius)} 0 1 1 ${round(cx)} ${round(cy + radius)}`,
      `A${round(radius)} ${round(radius)} 0 1 1 ${round(cx)} ${round(cy - radius)}`,
    ].join(" ");
  }
  const a0 = from * Math.PI * 2 - Math.PI / 2;
  const a1 = to * Math.PI * 2 - Math.PI / 2;
  const large = to - from > 0.5 ? 1 : 0;
  return [
    `M${round(cx + radius * Math.cos(a0))} ${round(cy + radius * Math.sin(a0))}`,
    `A${round(radius)} ${round(radius)} 0 ${large} 1`,
    `${round(cx + radius * Math.cos(a1))} ${round(cy + radius * Math.sin(a1))}`,
  ].join(" ");
}

/** Each slice's start and end as fractions of the whole. */
export function slices(values: number[]): { start: number; end: number }[] {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return values.map(() => ({ start: 0, end: 0 }));
  let at = 0;
  return values.map((v) => {
    const start = at;
    at += Math.max(0, v) / total;
    return { start, end: at };
  });
}

/**
 * Which labels to print under a series, so they do not collide.
 *
 * Thirty days at phone width is one label every ~11px, which is
 * unreadable overlap rather than dense information. Returns the indices
 * worth drawing, always including the first and last — the ends are the
 * two a reader actually looks for.
 */
export function labelIndices(count: number, maxLabels = 5): number[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  if (n <= maxLabels) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / (maxLabels - 1);
  const out = new Set<number>();
  for (let i = 0; i < maxLabels; i++) out.add(Math.round(i * step));
  return [...out].sort((a, b) => a - b);
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/** Two decimals is well under a pixel and keeps the path strings short. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
