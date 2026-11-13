/**
 * The hype mark, in the app's own shape.
 *
 * It was lucide's Star — the one shape in the action row that belonged to
 * somebody else's system, and the worst one to borrow: hype is what the app
 * is named around, and a stock five-point rating star was carrying it.
 *
 * Same five points, drawn fatter. The inner radius is a little over half the
 * outer rather than lucide's thinner waist, so the arms are stubbier and the
 * body reads as solid at the sizes it is actually used — 9px on a Show chip,
 * 12px on a badge, 23px in the action row. A thin-wristed star fills into a
 * blob at 9px; this one keeps its five points.
 *
 * The joins are round because every other corner in Hypefy is: avatars,
 * cards, the comment bubble and the verified badge are all squircles, and a
 * mitred point on the one gold thing in the row looked sharp next to them.
 *
 * Props mirror lucide's so call sites read the same either side of the swap.
 * `fill` is a presentation attribute, so a Tailwind `fill-hype` or
 * `fill-current` class still wins over it — exactly as it did with lucide.
 */
export function HypeIcon({
  size = 24,
  strokeWidth = 2,
  className = "",
  fill = "none",
  stroke = "currentColor",
  style,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** "currentColor" for the solid state, or a url(#id) for a gradient. */
  fill?: string;
  /** The deck paints both fill and stroke with the same gradient. */
  stroke?: string;
  /** HypeParticles positions each spark with one. */
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 2.4 L14.94 7.96 L21.13 9.03 L16.76 13.55 L17.64 19.77 L12 17 L6.36 19.77 L7.24 13.55 L2.87 9.03 L9.06 7.96 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
