"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";

/** Compact room Hype Meter — a lime→gold bar that fills in on mount. */
export function HypeMeter({ value }: { value: number }) {
  const target = Math.min(100, Math.max(0, value));
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(target));
    return () => cancelAnimationFrame(id);
  }, [target]);

  return (
    <div className="flex items-center gap-1.5" aria-label={`Hype ${target}%`}>
      <Star size={12} className="text-hype" fill="currentColor" />
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-hype transition-[width] duration-700 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
