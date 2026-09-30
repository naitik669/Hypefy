/**
 * The Rehype mark: two arrows chasing each other round a loop, so it reads as
 * "passed on" at a glance, the way every other app's reshare does.
 *
 * Drawn here rather than taken from lucide's Repeat2 (the paths are the same)
 * because the motion needs each arrow as its own group: on a rehype the two
 * arrows swap places, each travelling half way round the loop (see
 * .rehype-on / .rehype-off in globals.css).
 *
 * `pulse` plays the motion: bump it on each tap. Left at 0 it stays still, so
 * the state loading in never animates.
 */
export function RehypeIcon({
  size = 22,
  active = false,
  className = "",
  strokeWidth = 2.2,
  pulse = 0,
}: {
  size?: number;
  active?: boolean;
  className?: string;
  strokeWidth?: number;
  /** Increment on each tap to replay the motion. */
  pulse?: number;
}) {
  const motion = pulse === 0 ? "" : active ? "rehype-on" : "rehype-off";
  return (
    <svg
      // Keyed on the pulse so each tap remounts it and the animation plays again.
      key={pulse}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? strokeWidth + 0.4 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`rehype-icon overflow-visible ${motion} ${active ? "text-accent" : ""} transition-colors ${className}`}
      aria-hidden
    >
      <g className="rehype-all">
        <g className="rehype-a">
          <path d="M13 18H7a2 2 0 0 1-2-2V6" />
          <path d="m2 9 3-3 3 3" />
        </g>
        <g className="rehype-b">
          <path d="M11 6h6a2 2 0 0 1 2 2v10" />
          <path d="m22 15-3 3-3-3" />
        </g>
      </g>
    </svg>
  );
}

/**
 * The count beside it, rolling up into place on a rehype and down on an undo.
 * Keyed on the value so each change replays; still on first render.
 */
export function RehypeCount({ value, pulse, active }: { value: string; pulse: number; active: boolean }) {
  const motion = pulse === 0 ? "" : active ? "animate-rehype-count-up" : "animate-rehype-count-down";
  return (
    <span key={`${pulse}-${value}`} className={motion}>
      {value}
    </span>
  );
}
