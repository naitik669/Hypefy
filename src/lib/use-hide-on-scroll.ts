"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Chrome that gets out of the way going down and comes back going up.
 *
 * One hook rather than one copy per header. There are four bespoke headers
 * besides the shared PageHeader — Messages, Saved, a folder, Search — and
 * three copies of a scroll listener would have drifted the moment one of the
 * thresholds was tuned.
 *
 * The rules, in the order they are applied:
 *
 *   · Near the top, always shown. Otherwise the header would be hidden over
 *     the first row, which is the one place it is certainly not in the way,
 *     and pull-to-refresh lives up there.
 *   · Scrolling up by any real amount brings it straight back. "Once" means
 *     once: a few pixels is enough, because somebody reaching for the header
 *     flicks rather than scrolls.
 *   · Scrolling down hides it, but only after enough movement to mean it.
 *     Hiding on the first pixel makes the header flicker on the small
 *     corrections a thumb makes while reading.
 */

/** How far down the page before hiding is allowed at all. */
export const FREE_ZONE = 72;
/** Downward movement that counts as "going down", not a wobble. */
export const DOWN = 10;
/** Upward movement that counts as asking for it back. */
export const UP = 6;

export function useHideOnScroll(): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  /*
   * The frame is held so a burst of scroll events collapses into one read.
   * Reading scrollY in the listener itself is a layout request on every
   * event, which on a long list is the kind of thing that shows up as jank
   * rather than as a bug.
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

  return hidden;
}

/** The style a hiding header wears, so all five wear exactly the same one. */
export function hideStyle(hidden: boolean): React.CSSProperties {
  return {
    transform: hidden ? "translateY(-100%)" : "translateY(0)",
    transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
  };
}
