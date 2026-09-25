/**
 * Hypefy Verified Badge
 *
 * A squircle — the shape the rest of the app is built from — with a white
 * five-pointed star in it, lit from above.
 *
 * It used to be an eight-pointed seal around the same star. That is
 * Instagram's silhouette, and it put thirteen points inside the fourteen
 * pixels the badge is actually drawn at, so the star and the seal cancelled
 * each other out. A squircle has no points of its own, which leaves the star
 * as the only shape with any — so the mark Hypefy owns is the one that reads.
 *
 * Two details keep it legible small: the star's waist (how deep the valleys
 * cut between the points) is 0.47 rather than the old 0.40, so each point
 * still carries weight when it is three pixels long; and its corners are
 * rounded by stroking it in its own fill, so it speaks the same language as
 * the squircle around it.
 */

/**
 * Every badge draws the same gradient, so they share one id and the browser
 * resolves each `url(#…)` to an identical definition. A per-instance id would
 * have to be generated, which this component cannot do while it is still
 * usable from server components.
 */
const LIT = "hypefy-verified-lit";

/** Outer r=6.2, inner r=2.9 — a 0.47 waist. Clockwise from the top point. */
const STAR = [
  "M 12 5.8", //      outer top
  "L 13.7 9.65", //   inner
  "L 17.9 10.08", //  outer top-right
  "L 14.76 12.9", //  inner
  "L 15.64 17.02", // outer bottom-right
  "L 12 14.9", //     inner
  "L 8.36 17.02", //  outer bottom-left
  "L 9.24 12.9", //   inner
  "L 6.1 10.08", //   outer top-left
  "L 10.3 9.65", //   inner
  "Z",
].join(" ");

export function VerifiedStar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Verified" role="img">
      <defs>
        {/* Light down the face of the badge: bright at the top, deep below. */}
        <linearGradient id={LIT} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6AA4FF" />
          <stop offset="1" stopColor="#1B48CC" />
        </linearGradient>
      </defs>

      <rect x="2.5" y="2.5" width="19" height="19" rx="6.4" fill={`url(#${LIT})`} />

      {/* Stroked in its own fill, which is what rounds the ten corners. */}
      <path d={STAR} fill="#fff" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
