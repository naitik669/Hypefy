"use client";

import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { customGradient, isHexColor } from "@/lib/profile";

/** A few mixes to start from, so nobody faces two black swatches. */
export const GRADIENT_PRESETS: [string, string][] = [
  ["#331163", "#0b0b14"],
  ["#0f2f4f", "#050a12"],
  ["#1b4332", "#07120d"],
  ["#4a1020", "#120509"],
  ["#5a3a05", "#140d02"],
  ["#2b2b2b", "#050505"],
];

/**
 * Mix your own profile background from two colours, the way Discord's
 * profile colours work: the first sits at the top, the second at the bottom.
 * Premium only — everyone else sees what it is and where to get it.
 */
export function GradientPicker({
  value,
  onChange,
  isPremium,
}: {
  /** [top, bottom] hex colours, or null for the preset banner. */
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  isPremium: boolean;
}) {
  const top = isHexColor(value?.[0]) ? value![0] : "#331163";
  const bottom = isHexColor(value?.[1]) ? value![1] : "#0b0b14";
  const on = !!customGradient(value, true);

  if (!isPremium) {
    return (
      <Link
        href="/premium"
        className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 transition active:scale-[0.99]"
      >
        <span
          aria-hidden
          className="h-10 w-10 shrink-0 rounded-xl"
          style={{ background: customGradient(GRADIENT_PRESETS[0], true) ?? undefined }}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Your own colours</span>
          <span className="block text-xs text-muted">Mix a gradient background with Premium</span>
        </span>
        <Sparkles size={16} className="shrink-0 text-accent" />
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-16 w-16 shrink-0 rounded-2xl border border-white/10"
          style={{ background: customGradient([top, bottom], true) ?? undefined }}
        />
        <div className="flex min-w-0 flex-1 gap-2">
          <ColorField label="Top" value={top} onChange={(c) => onChange([c, bottom])} />
          <ColorField label="Bottom" value={bottom} onChange={(c) => onChange([top, c])} />
        </div>
        {on && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Use a preset instead"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted transition active:scale-95"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {GRADIENT_PRESETS.map(([a, b]) => (
          <button
            key={a + b}
            type="button"
            aria-label={`Gradient ${a} to ${b}`}
            aria-pressed={top.toLowerCase() === a && bottom.toLowerCase() === b}
            onClick={() => onChange([a, b])}
            className={`h-10 w-10 rounded-xl border-2 transition active:scale-95 ${
              top.toLowerCase() === a && bottom.toLowerCase() === b ? "border-accent" : "border-transparent"
            }`}
            style={{ background: customGradient([a, b], true) ?? undefined }}
          />
        ))}
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-2">
      {/* The platform's own colour picker: a wheel nobody has to learn. */}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} colour`}
        className="h-7 w-7 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
      />
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-wider text-faint">{label}</span>
        <span className="block truncate font-mono text-[11px] text-muted">{value.toUpperCase()}</span>
      </span>
    </label>
  );
}
