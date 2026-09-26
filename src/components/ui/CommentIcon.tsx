/**
 * The comment bubble, in the app's own shape.
 *
 * It was lucide's MessageCircle — a circle with a tail, and the one shape in
 * the action row that belonged to somebody else's system. Nothing else in
 * Hypefy is a circle: avatars, cards, folders and the verified badge are all
 * squircles, so the bubble is one too, at the same corner ratio.
 *
 * The tail stays. It is what makes a bubble a bubble rather than a button,
 * and it is short enough to hold its shape at the 10 pixels the search grid
 * draws it at. It also fills cleanly, which the old one could not — a circle's
 * tail closes into a blob when solid — so "you commented on this" has a state
 * available if it is ever wanted.
 *
 * Props mirror lucide's so call sites read the same either side of the swap.
 */
export function CommentIcon({
  size = 24,
  strokeWidth = 2,
  className = "",
  fill = "none",
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** "currentColor" for the solid state. */
  fill?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8.2 4 H15.8 A5.2 5.2 0 0 1 21 9.2 V12.3 A5.2 5.2 0 0 1 15.8 17.5 H11 L6.6 21 L7.6 17.5 H8.2 A5.2 5.2 0 0 1 3 12.3 V9.2 A5.2 5.2 0 0 1 8.2 4 Z"
        fill={fill}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
