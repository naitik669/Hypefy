"use client";

import {
  areaPath,
  labelIndices,
  linePath,
  rebase,
  slotCentres,
  yOf,
  type Box,
} from "@/lib/chart-scale";

/**
 * A running total over time — followers, mostly.
 *
 * Not a bar chart with thin bars. A follower count is a level, not a
 * quantity per day: the thing worth reading is the slope, and bars put
 * the emphasis on each day's height instead. It is also the one series
 * here that does not start at zero, which is why it goes through rebase
 * rather than being drawn straight.
 *
 * Same contract as BarChart: the arithmetic is in chart-scale, this turns
 * numbers into elements, and a screen reader gets a sentence rather than
 * a shape.
 */

const W = 320;
const H = 140;
const PLOT: Box = { x: 34, y: 8, width: W - 42, height: H - 30 };

export function LineChart({
  points,
  unit = "",
  color = "var(--color-accent)",
  className = "",
}: {
  points: { label: string; value: number }[];
  /** What the level counts, for the sentence a screen reader is read. */
  unit?: string;
  color?: string;
  className?: string;
}) {
  if (points.length < 2) {
    return (
      <p className={`px-1 text-xs text-faint ${className}`}>
        Not enough days to chart yet.
      </p>
    );
  }

  const raw = points.map((p) => p.value);
  const { values, max, floor } = rebase(raw);
  const xs = slotCentres(values.length, PLOT);
  const shownLabels = new Set(labelIndices(points.length, 4));

  const first = raw[0];
  const last = raw[raw.length - 1];
  const net = last - first;
  const summary =
    `${unit || "Total"} ${last}, from ${first} on ${points[0].label}` +
    ` to ${last} on ${points[points.length - 1].label}` +
    ` — ${net === 0 ? "no change" : `${net > 0 ? "up" : "down"} ${Math.abs(net)}`}`;

  // Two labels, at the floor and the peak, rather than evenly spaced
  // ticks: on a rebased axis an even tick is a number nobody asked about,
  // and the two that matter are where it started and where it got to.
  const axis = [
    { value: floor + max, y: yOf(max, max, PLOT) },
    { value: floor, y: yOf(0, max, PLOT) },
  ];

  return (
    <figure className={`m-0 ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={summary}>
        {axis.map((a) => (
          <g key={a.value}>
            <line
              x1={PLOT.x}
              x2={PLOT.x + PLOT.width}
              y1={a.y}
              y2={a.y}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <text
              x={PLOT.x - 6}
              y={a.y + 3.5}
              textAnchor="end"
              fontSize={9}
              fill="var(--color-faint)"
            >
              {compact(a.value)}
            </text>
          </g>
        ))}

        <path d={areaPath(values, max, PLOT)} fill={color} opacity={0.13} />
        <path
          d={linePath(values, max, PLOT)}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={xs[xs.length - 1]}
          cy={yOf(values[values.length - 1], max, PLOT)}
          r={3}
          fill={color}
        />

        {points.map((p, i) =>
          shownLabels.has(i) ? (
            <text
              key={p.label + i}
              x={xs[i]}
              y={H - 8}
              textAnchor="middle"
              fontSize={9}
              fill="var(--color-faint)"
            >
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
    </figure>
  );
}

/** 1.2k rather than 1200, so an axis label never outgrows its gutter. */
function compact(n: number): string {
  if (n >= 1_000_000) return `${Math.round((n / 1_000_000) * 10) / 10}m`;
  if (n >= 1_000) return `${Math.round((n / 1_000) * 10) / 10}k`;
  return String(Math.round(n));
}
