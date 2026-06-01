/** Gold Verified Star — Hypefy's verification badge. */
export function VerifiedStar({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      role="img"
      aria-label="Verified"
    >
      <path d="M12 1.8l2.7 5.5 6 .9-4.35 4.25 1.03 6L12 19.6 6.62 18.45l1.03-6L3.3 8.2l6-.9L12 1.8z" />
    </svg>
  );
}
