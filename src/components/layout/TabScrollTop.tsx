"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * A tab you open starts at its top.
 *
 * Scroll Home a while, then open Messages, and the inbox came up already part
 * way down. The app scrolls the window, and a tab change swaps what is in it:
 * for a moment that is the skeleton, which is shorter than the feed you were
 * reading, so the browser clamps the scroll to whatever the short page allows
 * instead of leaving it where it was — and then the real inbox arrives
 * underneath that leftover offset. The further down you were, the further
 * down the next tab opened.
 *
 * So: when the section changes, go to the top.
 *
 * Three things it deliberately leaves alone. Going back, where the whole
 * point is to find the page as you left it. Moving within a section — opening
 * a chat from the inbox, a post from the feed — which has its own idea of
 * where to start. And the first page of the session, which nothing has
 * scrolled yet.
 */

/** The tab a path belongs to: /messages/abc and /messages are the same place. */
export function sameSection(a: string, b: string): boolean {
  const tab = (p: string) => p.split("/")[1] ?? "";
  return tab(a) === tab(b);
}

export function TabScrollTop() {
  const path = usePathname();
  const seen = useRef<string | null>(null);
  const wentBack = useRef(false);

  useEffect(() => {
    const onPop = () => {
      wentBack.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const from = seen.current;
    seen.current = path;
    if (from === null) return;
    if (wentBack.current) {
      wentBack.current = false;
      return;
    }
    if (sameSection(from, path)) return;
    window.scrollTo(0, 0);
    // Again on the next frame: the skeleton can arrive after this effect and
    // bring the clamped offset back with it.
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }, [path]);

  return null;
}
