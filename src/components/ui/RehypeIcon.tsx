import { Repeat2 } from "lucide-react";

/**
 * The Rehype mark: the repeat arrows, so it reads as "passed on" at a glance,
 * the way every other app's reshare does. Kept in one place so the feed, the
 * Shots rail and the profile tab never drift apart.
 */
export function RehypeIcon({
  size = 22,
  active = false,
  className = "",
  strokeWidth = 2.2,
}: {
  size?: number;
  active?: boolean;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <Repeat2
      size={size}
      strokeWidth={active ? strokeWidth + 0.4 : strokeWidth}
      className={`${active ? "text-accent" : ""} transition-colors ${className}`}
      aria-hidden
    />
  );
}
