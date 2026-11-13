"use client";

import type { ReactNode } from "react";
import { hideStyle, useHideOnScroll } from "@/lib/use-hide-on-scroll";

/**
 * The sticky wrapper for a header that cannot hide itself.
 *
 * Home's top bar is a server component — it seeds the unread count from the
 * database — so the scrolling cannot live inside it. This is the sticky
 * element instead, and the bar is its child.
 *
 * Every other header hides itself: PageHeader, which 33 routes draw through,
 * and the four bespoke ones (Messages, Saved, a folder, Search) all call
 * useHideOnScroll directly. The rules the five of them follow live in that
 * hook rather than here, so tuning a threshold tunes all of them.
 */
export function HideOnScroll({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const hidden = useHideOnScroll();

  return (
    <div
      className={`sticky top-0 z-20 will-change-transform motion-reduce:transition-none ${className}`}
      style={hideStyle(hidden)}
    >
      {children}
    </div>
  );
}
