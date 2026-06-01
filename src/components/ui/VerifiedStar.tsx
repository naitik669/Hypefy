/**
 * Hypefy Verified Star — a filled blue disc with a white 5-pointed
 * star inside. More badge-like and distinct from the gold Hype star.
 */
export function VerifiedStar({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      aria-label="Verified"
      role="img"
    >
      {/* Filled circle badge */}
      <circle cx="10" cy="10" r="10" fill="currentColor" />
      {/* White 5-pointed star — outer r=6, inner r=2.4 */}
      <path
        fill="white"
        d="M10 3.5 L11.5 7.9 L16.2 8.0 L12.5 10.8 L13.8 15.3 L10 12.6 L6.2 15.3 L7.5 10.8 L3.8 8.0 L8.5 7.9 Z"
      />
    </svg>
  );
}
