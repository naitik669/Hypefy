"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Chrome that gets out of the way going down and comes back going up.
 *
 * The top bar is a server component — it seeds the unread count from the
 * database — so the scrolling cannot live inside it. This is the sticky
 * element instead, and the bar is its child.
 *
 * The rules, in the order they are applied:
 *
 *   · Near the top, always shown. Otherwise the bar would be hidden over the
 *     first post, which is the one place it is certainly not in the way, and
 *     the pull-to-refresh lives up there too.
 *   · Scrolling up by any real amount brings it straight back. "Once" means
 *     once: a few pixels of upward movement is enough, because somebody
 *     reaching for the bar flicks rather than scrolls.
 *   · Scrolling down hides it, but only after it has moved far enough to
 *     mean it. Hiding on the first pixel makes the bar flicker on the small
 *     corrections a thumb makes while reading.
 */

/** How far down the page before hiding is allowed at all. */
const FREE_ZONE = 72;
/** Downward movement that counts as "going down", not a wobble. */
const DOWN = 10;
/** Upward movement that counts as asking for it back. */
const UP = 6;

export function HideOnScroll({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  /*
   * The frame is held so a burst of scroll events collapses into one read of
   * the state. Reading scrollY in the listener itself is a layout request on
   * every event, which on a long feed is the kind of thing that shows up as
   * jank rather than as a bug.
   */
  const frame = useRef<number | null>(null);

  useEffect(() => {
    lastY.current = window.scrollY;

    function read() {
      frame.current = null;
      const y = window.scrollY;
      const dy = y - lastY.current;

      if (y <= FREE_ZONE) setHidden(false);
      else if (dy > DOWN) setHidden(true);
      else if (dy < -UP) setHidden(false);

      // Only remembered once a move was big enough to judge, so a slow drag
      // accumulates into a decision instead of being read as stillness.
      if (Math.abs(dy) > UP) lastY.current = y;
    }

    function onScroll() {
      if (frame.current === null) frame.current = requestAnimationFrame(read);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <div
      className={`sticky top-0 z-20 will-change-transform motion-reduce:transition-none ${className}`}
      style={{
        transform: hidden ? "translateY(-100%)" : "translateY(0)",
        transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {children}
    </div>
  );
}
