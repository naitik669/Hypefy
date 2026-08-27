"use client";

import { useState } from "react";

export type SeriesPoint = { day: string; hypes: number; comments: number; saves: number; follows: number };

type MetricKey = "hypes" | "comments" | "saves" | "follows";

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: "hypes", label: "Hypes", color: "var(--color-hype, #ffd60a)" },
  { key: "comments", label: "Comments", color: "#5ac8fa" },
  { key: "saves", label: "Saves", color: "#bf5af2" },
  { key: "follows", label: "Follows", color: "var(--color-accent, #c8ff00)" },
];

/**
 * Dependency-free engagement chart: a bar per day for the selected metric.
 * Hand-rolled SVG rather than a chart library — the app ships no charting
 * dependency and this is a single series.
 */
export function InsightsChart({ series }: { series: SeriesPoint[] }) {
  const [metric, setMetric] = useState<MetricKey>("hypes");
  const active = METRICS.find((m) => m.key === metric)!;

  const values = series.map((p) => p[metric]);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);

  // Bars are laid out in a 0..100 x 0..100 viewBox and stretched by CSS, so the
  // chart stays crisp at any width without measuring the container.
  const n = series.length || 1;
  const slot = 100 / n;
  const barW = Math.max(slot * 0.55, 0.8);

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold text-muted">Last {series.length} days</p>
        <p className="text-sm font-bold tabular-nums">{total} {active.label.toLowerCase()}</p>
      </div>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="mt-3 h-28 w-full"
        role="img"
        aria-label={`${active.label} per day for the last ${series.length} days`}
      >
        {series.map((p, i) => {
          const v = p[metric];
          const h = (v / max) * 100;
          return (
            <rect
              key={p.day}
              x={i * slot + (slot - barW) / 2}
              y={100 - h}
              width={barW}
              height={h === 0 ? 0.6 : h}
              rx={0.5}
              fill={v === 0 ? "var(--color-border, #2a2a2a)" : active.color}
            >
              <title>{`${p.day}: ${v} ${active.label.toLowerCase()}`}</title>
            </rect>
          );
        })}
      </svg>

      <div className="mt-3 flex gap-1.5">
        {METRICS.map((m) => {
          const on = m.key === metric;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              aria-pressed={on}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors ${
                on ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
