"use client";

import { useId } from "react";

/**
 * Gradient star shown next to a username when the CURRENT viewer has added
 * that person as a Hyper (close friend). Distinct from VerifiedStar (solid
 * blue, a platform-granted badge) — this one is a personal, per-viewer
 * relationship indicator, so it always renders with a warm gradient fill.
 */
export function HyperStar({ className = "" }: { className?: string }) {
  const gradId = useId();
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Hyper" role="img">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD000" />
          <stop offset="55%" stopColor="#FF7A00" />
          <stop offset="100%" stopColor="#C8FF00" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradId})`}
        d={[
          "M 12 2",
          "L 14.09 8.26",
          "L 20.78 8.27",
          "L 15.39 12.11",
          "L 17.45 18.38",
          "L 12 14.57",
          "L 6.55 18.38",
          "L 8.61 12.11",
          "L 3.22 8.27",
          "L 9.91 8.26",
          "Z",
        ].join(" ")}
      />
    </svg>
  );
}
