"use client";

import { useEffect, useState } from "react";
import { PointerNote } from "@/components/ui/CoachMarks";
import { noteSpotlightPointed, noteSpotlightPosted, readSpotlightUse, shouldPoint } from "@/lib/spotlight-nudge";

/** After the deck has slid out and before its show ends (see FloatingPages). */
export const POINT_AFTER_MS = 1100;

/**
 * The note that points at the Spotlight deck in Messages.
 *
 * For people who have not put a page on Spotlight in the last week: shown
 * the first time, then only now and then, and only a few times in all. See
 * lib/spotlight-nudge for the rule. Someone whose own page is up is told
 * nothing, and that sighting is what resets the count.
 */
export function SpotlightPointer({ ownPageAt }: { ownPageAt: string | null }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Their page is up: they post. Remember when.
    noteSpotlightPosted(ownPageAt);
    const t = setTimeout(() => {
      const now = Date.now();
      if (!shouldPoint(readSpotlightUse(), now)) return;
      // Counted when shown, so "a few times" is a few, read or not.
      noteSpotlightPointed(now);
      setShow(true);
    }, POINT_AFTER_MS);
    return () => clearTimeout(t);
  }, [ownPageAt]);

  if (!show) return null;
  return (
    <PointerNote
      id="spotlight"
      target="spotlight"
      // The deck has just slid out and is playing its show: it needs no outline.
      ring={false}
      text="This is Spotlight. Tap the deck to read today's pages or write yours."
      onGone={() => setShow(false)}
    />
  );
}
