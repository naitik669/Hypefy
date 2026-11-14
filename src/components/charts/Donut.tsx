"use client";

import { arcPath, slices } from "@/lib/chart-scale";

/**
 * A ring, for a handful of parts of one whole.
 *
 * Used where the proportion is the point and the absolute numbers are
 * secondary — where a share went, followers against strangers. Above about
 * five segments a ring stops being readable and a list of rows is better,
 * so this does not try to handle twenty.
 *
 * A ring rather than a pie because the middle is the most useful part of
 * the shape: it holds the total, which is the number people actually came
 * for, and it means no segment is a thin wedge meeting at a point.
 *
 * The legend is the accessible version. The ring carries aria-hidden and
 * the figure gets the sentence, because a screen reader reading out six
 * path elements communicates nothing.
 */

const SIZE = 120;
const R = 46;
const STROKE = 16;

export type Slice = { label: string; value: number; color: string };

export function Donut({
  data,
  centreLabel,
  className = "",
}: {
  data: Slice[];
  /** What goes in the hole. Usually the total. */
  centreLabel?: string;
  className?: string;
}) {
  const values = data.map((d) => Math.max(0, d.value));
  const total = values.reduce((a, b) => a + b, 0);
  const parts = slices(values);

  if (total <= 0) {
    return <p className={`text-xs text-faint ${className}`}>Nothing to show yet.</p>;
  }

  const summary = data
    .map((d) => `${d.label} ${Math.round((Math.max(0, d.value) / total) * 100)}%`)
    .join(", ");

  return (
    <figure className={`m-0 flex items-center gap-4 ${className}`} role="img" aria-label={summary}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-[120px] w-[120px] shrink-0" aria-hidden>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={STROKE}
        />
        {parts.map((s, i) =>
          s.end > s.start ? (
            <path
              key={data[i].label}
              d={arcPath(SIZE / 2, SIZE / 2, R, s.start, s.end)}
              fill="none"
              stroke={data[i].color}
              strokeWidth={STROKE}
              /* Butt, not round: round caps on adjacent segments overlap
                 each other and make a 1% slice look like 4%. */
              strokeLinecap="butt"
            />
          ) : null,
        )}
        {centreLabel && (
          <text
            x={SIZE / 2}
            y={SIZE / 2 + 5}
            textAnchor="middle"
            fontSize={18}
            fontWeight={800}
            fill="var(--color-foreground)"
          >
            {centreLabel}
          </text>
        )}
      </svg>

      <figcaption className="flex min-w-0 flex-1 flex-col gap-1.5">
        {data.map((d) => (
          <span key={d.label} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: d.color }}
            />
            <span className="min-w-0 flex-1 truncate text-muted">{d.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">
              {Math.max(0, d.value)}
            </span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
