import { Star } from "lucide-react";

/** Compact room Hype Meter — a lime→gold bar driven by recent hype. */
export function HypeMeter({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Hype ${value}%`}>
      <Star size={12} className="text-hype" fill="currentColor" />
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-hype"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
