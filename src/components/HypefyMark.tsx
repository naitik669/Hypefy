/**
 * The loading glyph — a dashed aperture ring with a pulse core.
 *
 * This used to double as the brand mark. It no longer does: the brand is
 * "H." (see HypefyLogo), which cannot spin without looking broken. A ring
 * reads correctly in motion, which is exactly what PullToRefresh and
 * EmptyState need of it, so it stays on as the loading indicator.
 *
 * Reach for HypefyLogo anywhere the mark stands in for the brand.
 */
export function HypefyMark({
  className = "",
  spin = false,
}: {
  className?: string;
  spin?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
      className={`${spin ? "animate-spin-slow" : ""} ${className}`}
    >
      <circle
        cx="20"
        cy="20"
        r="14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="2 4.2"
      />
      <circle cx="20" cy="20" r="3.2" fill="currentColor" />
    </svg>
  );
}
