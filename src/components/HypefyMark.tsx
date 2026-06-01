/**
 * Hypefy mark — a dashed aperture ring with a pulse core.
 * Placeholder brand glyph; will gain motion + personality later.
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
