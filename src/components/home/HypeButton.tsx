"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { formatCount } from "@/lib/mock";

export function HypeButton({
  initialHyped,
  initialCount,
}: {
  initialHyped: boolean;
  initialCount: number;
}) {
  const [hyped, setHyped] = useState(initialHyped);
  const [count, setCount] = useState(initialCount);
  const [burst, setBurst] = useState(false);

  function toggle() {
    const next = !hyped;
    setHyped(next);
    setCount((c) => c + (next ? 1 : -1));
    if (next) {
      setBurst(true);
      setTimeout(() => setBurst(false), 360);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hyped}
      aria-label="Hype"
      className="flex items-center gap-1.5 text-sm font-semibold tabular-nums transition-colors"
    >
      <Star
        size={24}
        strokeWidth={2.2}
        className={`${burst ? "animate-hype-burst" : ""} transition-colors ${
          hyped ? "text-hype" : "text-foreground"
        }`}
        fill={hyped ? "currentColor" : "none"}
      />
      <span className={hyped ? "text-hype" : "text-foreground"}>
        {formatCount(count)}
      </span>
    </button>
  );
}
