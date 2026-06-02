/**
 * Hypefy Verified Badge
 *
 * 8-pointed seal shape with a white 5-pointed star inside — consistent
 * with Hypefy's star/Hype identity. Outer tips r=10, valley r=7 (deeper
 * notches than before to match the reference). 24×24 viewBox.
 */
export function VerifiedStar({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-label="Verified"
      role="img"
    >
      {/*
        8-pointed rounded seal
        Outer tips at r=10  (top=270°, top-right=315°, …)
        Inner valleys at r=7 (22.5° offset from each tip)
        Q curves: each outer tip is the bezier control point,
        valley points are the anchors → smooth peaks, sharp V-valleys
      */}
      <path
        fill="currentColor"
        d={[
          "M 9.32 5.53",                  // inner 247.5°
          "Q 12 2 14.68 5.53",            // → top tip (270°)        → inner 292.5°
          "Q 19.07 4.93 18.47 9.32",      // → top-right tip (315°)  → inner 337.5°
          "Q 22 12 18.47 14.68",          // → right tip (0°)        → inner 22.5°
          "Q 19.07 19.07 14.68 18.47",    // → bottom-right (45°)    → inner 67.5°
          "Q 12 22 9.32 18.47",           // → bottom tip (90°)      → inner 112.5°
          "Q 4.93 19.07 5.53 14.68",      // → bottom-left (135°)    → inner 157.5°
          "Q 2 12 5.53 9.32",             // → left tip (180°)       → inner 202.5°
          "Q 4.93 4.93 9.32 5.53",        // → top-left tip (225°)   → inner 247.5°
          "Z",
        ].join(" ")}
      />

      {/*
        White 5-pointed star, centered at (12,12)
        Outer r=6, inner r=2.4
        Points starting from top (270°), going clockwise
      */}
      <path
        fill="white"
        d={[
          "M 12 6",           // outer top
          "L 13.41 10.06",    // inner
          "L 17.71 10.15",    // outer top-right
          "L 14.28 12.74",    // inner
          "L 15.53 16.85",    // outer bottom-right
          "L 12 14.4",        // inner
          "L 8.47 16.85",     // outer bottom-left
          "L 9.72 12.74",     // inner
          "L 6.29 10.15",     // outer top-left
          "L 10.59 10.06",    // inner
          "Z",
        ].join(" ")}
      />
    </svg>
  );
}
