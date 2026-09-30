import { Repeat2 } from "lucide-react";

/**
 * The Rehype mark: the repeat arrows, so it reads as "passed on" at a glance,
 * the way every other app's reshare does. Kept in one place so the feed, the
 * Shots rail and the profile tab never drift apart.
 *
 * `pulse` plays the motion: bump it on each tap and the arrows turn — a half
 * turn with a pop when something is rehyped, a small turn back when it is
 * taken back (see .animate-rehype-on / -off in globals.css). Left at 0 it
 * stays still, so the state loading in never animates.
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
  const motion = pulse === 0 ? "" : active ? "animate-rehype-on" : "animate-rehype-off";
  return (
    // Keyed on the pulse so each tap remounts it and the animation plays again.
    <span key={pulse} className={`inline-flex ${motion}`} aria-hidden>
      <Repeat2
        size={size}
        strokeWidth={active ? strokeWidth + 0.4 : strokeWidth}
        className={`${active ? "text-accent" : ""} transition-colors ${className}`}
      />
    </span>
  );
}
