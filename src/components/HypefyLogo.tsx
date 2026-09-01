/**
 * The Hypefy brand mark — "H." — matching the app icon, the social card
 * and hypefy.chat.
 *
 * Two-tone on purpose: the H takes `currentColor` so it can sit on any
 * surface, while the full stop is always the brand lime. That full stop is
 * the signature the wordmark uses too, so it does not get tinted away.
 *
 * Geometry is the real artwork's, scaled from its native 404px frame into
 * a 40x40 box and centred there — the same viewBox HypefyMark uses, so the
 * two are drop-in interchangeable at any size.
 *
 * This is the static brand mark. For the loading indicator, use
 * HypefyMark: it is a ring, which is what makes it legible while spinning.
 */
export function HypefyLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden className={className}>
      {/* Left stem, right stem, crossbar */}
      <rect x="4" y="5.8" width="7" height="28.4" fill="currentColor" />
      <rect x="21.8" y="5.8" width="6.8" height="28.4" fill="currentColor" />
      <rect x="4" y="16.8" width="24.6" height="5.8" fill="currentColor" />
      {/* The lime full stop, never tinted */}
      <rect
        x="31.4"
        y="29.6"
        width="4.6"
        height="4.6"
        fill="var(--color-accent)"
      />
    </svg>
  );
}
