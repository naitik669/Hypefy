"use client";

import { areaPath, linePath, type Box } from "@/lib/chart-scale";

/**
 * A trend, small enough to sit inside a number card.
 *
 * No axes, no labels, no gridlines — a sparkline that gains them is just a
 * small chart, and the point of this shape is that it reads as part of the
 * figure it sits under rather than as a thing to study.
 *
 * It carries no aria-label of its own and is hidden from screen readers.
 * That is deliberate rather than an omission: the card already states the
 * number and its period in text, and "a line that goes up a bit" read out
 * between the two adds nothing a reader can act on.
 */

const W = 100;
const H = 28;
const BOX: Box = { x: 1, y: 2, width: W - 2, height: H - 4 };

export function Sparkline({
  values,
  color = "var(--color-accent)",
  className = "",
}: {
  values: number[];
  color?: string;
  className?: string;
}) {
  if (values.length < 2) return null;
  const peak = Math.max(0, ...values);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`h-7 w-full ${className}`}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      {/* preserveAspectRatio="none" is right HERE and wrong on the bar
          chart: there is no text and no round cap to distort, and the
          shape is wanted stretched to whatever width the card is. */}
      <path d={areaPath(values, peak, BOX)} fill={color} opacity={0.14} />
      <path
        d={linePath(values, peak, BOX)}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
