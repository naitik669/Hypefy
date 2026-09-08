import { Star } from "lucide-react";

/**
 * A star snapping in two and falling — played when a hype is TAKEN BACK.
 *
 * Hyping had a burst and an outward spray of stars; un-hyping had nothing at
 * all, so the most destructive of the two actions was the silent one. You
 * could tap it by accident and get no acknowledgement that anything happened.
 *
 * Two halves rather than a shatter: the star is small (23px in the feed, 26 in
 * the reel), and fragments at that size read as noise. A clean break down the
 * middle is legible at a glance and says "undone" rather than "destroyed".
 *
 * Both halves are the SAME filled star, clipped to one side each — so the two
 * pieces always match the icon they came from, whatever its size or colour.
 */
export function HypeBreak({ size = 23 }: { size?: number }) {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span
        className="animate-hype-break-left absolute text-hype"
        // inset(top right bottom left): keep the left half, clip the right.
        style={{ clipPath: "inset(0 50% 0 0)" }}
      >
        <Star size={size} fill="currentColor" strokeWidth={2.2} />
      </span>
      <span
        className="animate-hype-break-right absolute text-hype"
        style={{ clipPath: "inset(0 0 0 50%)" }}
      >
        <Star size={size} fill="currentColor" strokeWidth={2.2} />
      </span>
    </span>
  );
}
