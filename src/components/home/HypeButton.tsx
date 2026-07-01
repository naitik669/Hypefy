"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { formatCount } from "@/lib/format";
import { HypeParticles } from "@/components/feed/HypeParticles";
import { haptics } from "@/lib/haptics";

/** Controlled Hype button â€” state lives in the parent (PostCard). */
export function HypeButton({
  hyped,
  count,
  onToggle,
}: {
  hyped: boolean;
  count: number;
  onToggle: () => void;
}) {
  const [burst, setBurst] = useState(false);
  const [particles, setParticles] = useState(false);

  function handle() {
    if (!hyped) {
      haptics.success();
      setBurst(true);
      setParticles(true);
      setTimeout(() => setBurst(false), 360);
      setTimeout(() => setParticles(false), 600);
    }
    onToggle();
  }

  return (
    <button
      type="button"
      onClick={handle}
      aria-pressed={hyped}
      aria-label="Hype"
      className="flex items-center gap-1.5 text-sm font-semibold tabular-nums transition-transform duration-150 active:scale-90"
    >
      <span className="relative">
        <Star
          size={24}
          strokeWidth={2.2}
          className={`${burst ? "animate-hype-burst" : ""} transition-colors ${
            hyped ? "text-hype" : "text-foreground"
          }`}
          fill={hyped ? "currentColor" : "none"}
        />
        {particles && <HypeParticles size={9} />}
      </span>
      <span className={hyped ? "text-hype" : "text-foreground"}>
        {formatCount(count)}
      </span>
    </button>
  );
}
