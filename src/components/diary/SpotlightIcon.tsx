import { useId } from "react";

/**
 * Spotlight's mark: two pages leaning on each other the way the deck does,
 * the front one carrying a spark. Drawn for Hypefy rather than taken from an
 * icon set — the open book it replaces said "reading", which Spotlight is
 * not, and at 22px its thin inner lines turned to mush.
 *
 * Bold strokes, round joins, the back page cut away where the front one
 * overlaps it so the two never tangle. Uses currentColor, so it takes the
 * colour of whatever it sits in.
 */
export function SpotlightIcon({
  size = 24,
  strokeWidth = 2.3,
  className = "",
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const mask = `spot${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const front = { x: 9.4, y: 3.4, width: 11.2, height: 15.2, rx: 3.3, transform: "rotate(9 15 11)" };
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="white" stroke="none" />
          <rect {...front} fill="black" stroke="black" strokeWidth={strokeWidth + 2.4} />
        </mask>
      </defs>
      <rect x="3.3" y="5.6" width="10.6" height="14.4" rx="3.1" transform="rotate(-13 8.6 12.8)" mask={`url(#${mask})`} />
      <rect {...front} />
      {/* The spark: four curved points. */}
      <path
        d="M15 7.1 Q15.4 10.6 18.9 11 Q15.4 11.4 15 14.9 Q14.6 11.4 11.1 11 Q14.6 10.6 15 7.1 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={0.8}
        transform="rotate(9 15 11)"
      />
    </svg>
  );
}
