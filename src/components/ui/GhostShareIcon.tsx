/**
 * Ghost Share's mark: the share arrow, with its tail breaking into dashes
 * and fading out. It arrives, and leaves no trail back to whoever sent it.
 *
 * Drawn here rather than borrowed from the icon set because nothing in one
 * says this. It takes its colour from the text around it, like the others.
 */
export function GhostShareIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {/* The tail: furthest from the head, faintest. */}
      <path d="M2 13.2 L5.6 9.6" strokeDasharray="1.1 2.5" opacity="0.4" />
      <path d="M7.2 8 L10 5.2" strokeDasharray="2 2.3" opacity="0.75" />
      {/* The head, whole. */}
      <path d="M9 2.8 H13.2 V7" />
      <path d="M13.2 2.8 L11.4 4.6" />
    </svg>
  );
}
