/**
 * Hypefy Verified Badge
 *
 * 8-pointed rounded seal shape (like the reference badge) with a white
 * checkmark inside, rendered in the caller's `currentColor` (blue).
 *
 * Geometry: 8 quadratic bezier curves — each outer tip is the *control*
 * point, inner "valley" points are the start/end anchors — gives the
 * characteristic smooth peaks + sharp V-valleys of the seal badge.
 *
 * 24 × 24 viewBox. Outer radius ≈ 10, inner valley radius ≈ 7.5.
 */
export function VerifiedStar({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-label="Verified"
      role="img"
    >
      {/* 8-pointed rounded badge shape */}
      <path
        fill="currentColor"
        d={[
          "M 9.13 5.07",          // start at inner (247.5°)
          "Q 12 2 14.87 5.07",    // top outer tip   → inner (292.5°)
          "Q 19.07 4.93 18.93 9.13",   // top-right tip   → inner (337.5°)
          "Q 22 12 18.93 14.87",  // right tip       → inner (22.5°)
          "Q 19.07 19.07 14.87 18.93", // bottom-right   → inner (67.5°)
          "Q 12 22 9.13 18.93",   // bottom tip      → inner (112.5°)
          "Q 4.93 19.07 5.07 14.87",  // bottom-left    → inner (157.5°)
          "Q 2 12 5.07 9.13",     // left tip        → inner (202.5°)
          "Q 4.93 4.93 9.13 5.07",    // top-left tip   → inner (247.5°)
          "Z",
        ].join(" ")}
      />

      {/* White checkmark */}
      <path
        d="M 7.5 12 L 10.5 15.5 L 17.5 8.5"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
