"use client";

import {
  bars,
  labelIndices,
  niceMax,
  ticks,
  yOf,
  type Box,
} from "@/lib/chart-scale";

/**
 * Days along the bottom, a count up the side.
 *
 * Hand-rolled, like InsightsChart before it, and for the reason stated in
 * lib/chart-scale: no charting library on a phone for a bar and a line.
 * What is different here is that none of the arithmetic is in this file —
 * it is all in chart-scale, where it is tested. This turns numbers into
 * elements and does nothing else.
 *
 * Drawn in its own coordinate space at a fixed aspect, NOT with
 * preserveAspectRatio="none". Stretching a square viewBox to fit a wide
 * box is how the old chart avoided doing layout, and it also stretched
 * every stroke and every glyph with it.
 *
 * A screen reader gets the table, not the picture: an SVG of rectangles
 * says nothing at all without one, and `aria-label` with a sentence is
 * the difference between a chart and a decoration.
 */

const W = 320;
const H = 140;
const PLOT: Box = { x: 30, y: 8, width: W - 38, height: H - 30 };

export type BarChartProps = {
  points: { label: string; value: number }[];
  /** What one bar counts, for the summary a screen reader is read. */
  unit?: string;
  /** A CSS colour or var() for the bars. */
  color?: string;
  className?: string;
};

export function BarChart({
  points,
  unit = "",
  color = "var(--color-accent)",
  className = "",
}: BarChartProps) {
  const values = points.map((p) => Math.max(0, p.value));
  const peak = Math.max(0, ...values);
  const top = niceMax(peak);
  const slots = bars(values.length, PLOT);
  const gridlines = ticks(peak, 2);
  const shownLabels = new Set(labelIndices(points.length, 5));
  const total = values.reduce((a, b) => a + b, 0);

  if (points.length === 0) {
    return (
      <p className={`px-1 text-xs text-faint ${className}`}>Nothing to chart yet.</p>
    );
  }

  const summary =
    `${total} ${unit || "in total"} across ${points.length} day${points.length === 1 ? "" : "s"}` +
    (peak > 0 ? `, busiest ${points[values.indexOf(peak)]?.label ?? ""} at ${peak}` : "");

  return (
    <figure className={`m-0 ${className}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={summary}
      >
        {gridlines.map((t) => {
          const y = yOf(t, peak, PLOT);
          return (
            <g key={t}>
              <line
                x1={PLOT.x}
                x2={PLOT.x + PLOT.width}
                y1={y}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              <text
                x={PLOT.x - 6}
                y={y + 3.5}
                textAnchor="end"
                fontSize={9}
                fill="var(--color-faint)"
              >
                {compact(t)}
              </text>
            </g>
          );
        })}

        {values.map((v, i) => {
          const y = yOf(v, peak, PLOT);
          const height = PLOT.y + PLOT.height - y;
          return (
            <rect
              key={points[i].label + i}
              x={slots[i].x}
              // A day with nothing still gets a sliver, so the axis reads as
              // a row of days rather than as gaps where data failed to load.
              y={v > 0 ? y : PLOT.y + PLOT.height - 1}
              width={slots[i].width}
              height={v > 0 ? Math.max(1, height) : 1}
              rx={Math.min(2, slots[i].width / 2)}
              fill={v > 0 ? color : "var(--color-border)"}
            />
          );
        })}

        {points.map((p, i) =>
          shownLabels.has(i) ? (
            <text
              key={p.label + i}
              x={slots[i].x + slots[i].width / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize={9}
              fill="var(--color-faint)"
            >
              {p.label}
            </text>
          ) : null,
        )}

        <line
          x1={PLOT.x}
          x2={PLOT.x + PLOT.width}
          y1={PLOT.y + PLOT.height}
          y2={PLOT.y + PLOT.height}
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        {/* Referenced so the nice-max is not silently different from the
            gridline labels if one of them is ever changed. */}
        <desc>{`Axis to ${top}`}</desc>
      </svg>
    </figure>
  );
}

/** 1.2k rather than 1200, so an axis label never outgrows its gutter. */
function compact(n: number): string {
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}m`;
  if (n >= 1_000) return `${trim(n / 1_000)}k`;
  return String(Math.round(n * 10) / 10);
}

function trim(n: number): string {
  return String(Math.round(n * 10) / 10);
}
