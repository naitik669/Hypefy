import { Star } from "lucide-react";

/**
 * Shown next to a username in addition to HyperStar once BOTH people have
 * added each other as Hypers — the reciprocal "link" the product calls
 * Hypers (mirrors how Verified Star is a one-way platform badge vs. this
 * being a two-way, earned-together relationship). Solid dark star on a
 * warm gradient chip so it reads clearly against the gradient fill.
 */
export function MutualHyperBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="You're both Hypers"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none text-black ${className}`}
      style={{ background: "linear-gradient(135deg, #FFD000 0%, #FF7A00 55%, #C8FF00 100%)" }}
    >
      <Star size={10} className="fill-black text-black" />
      Hypers
    </span>
  );
}
