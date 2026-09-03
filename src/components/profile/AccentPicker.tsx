"use client";

import { Check } from "lucide-react";
import { ACCENTS, DEFAULT_ACCENT_ID } from "@/lib/profile-accent";

/**
 * Picks the colour a profile wears. Shaped like BannerPicker, round rather
 * than rectangular so the two are not mistaken for each other in Settings.
 *
 * The tick is drawn in the accent's own ink, which is the point of storing
 * ink per accent — on a light swatch it reads, and it would keep reading on a
 * dark one added later without any change here.
 */
export function AccentPicker({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (id: string) => void;
}) {
  const current = value ?? DEFAULT_ACCENT_ID;

  return (
    <div className="flex flex-wrap gap-2.5">
      {ACCENTS.map((a) => {
        const on = a.id === current;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onChange(a.id)}
            aria-label={a.label}
            aria-pressed={on}
            title={a.label}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95"
            style={{
              background: a.color,
              outline: on ? "3px solid var(--color-foreground)" : "none",
              outlineOffset: "2px",
            }}
          >
            {on ? <Check size={16} style={{ color: a.ink }} /> : null}
          </button>
        );
      })}
    </div>
  );
}
