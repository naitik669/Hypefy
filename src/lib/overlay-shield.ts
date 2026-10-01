"use client";

import { useEffect } from "react";
import { useOverlayBackButton } from "@/lib/overlay-stack";

/**
 * What it takes for the app to be properly behind something.
 *
 * An overlay that only draws over the page is not closed off: the page keeps
 * scrolling under a drag, the feed still swipes, a pinch still reaches the
 * photo, and Android's back button navigates away underneath. Each of those
 * was found and fixed on its own sheet at some point; this is the three of
 * them in one place so a new overlay gets them by being written, not by being
 * reported.
 *
 * Three parts, because they are three different leaks:
 *
 *   the page is frozen   — a drag on an overlay chains to the nearest
 *                          scrollable ancestor, which is the document;
 *   events stop here     — a portal is outside the DOM but inside the React
 *                          tree, so touches inside it are still delivered to
 *                          the handlers of whatever rendered it;
 *   it is on the stack   — so back closes it, and the gestures that ask
 *                          (the tab swipe, the feed, the reels) stand down.
 */

/**
 * Freeze the page behind an overlay.
 *
 * position:fixed rather than overflow:hidden because iOS ignores the latter
 * on body; the scroll offset is stashed and restored so closing does not
 * fling you back to the top of the feed.
 *
 * Counted, because overlays stack — a GIF picker over comments closing must
 * not unlock the page while the comments are still open. The count lives on
 * the body so every overlay in the app shares one, however it was built.
 */
export function useFrozenPage(open: boolean) {
  useEffect(() => {
    if (!open) return;

    const body = document.body;
    const depth = Number(body.dataset.sheetDepth ?? "0");
    body.dataset.sheetDepth = String(depth + 1);

    if (depth === 0) {
      const y = window.scrollY;
      body.dataset.sheetScrollY = String(y);
      body.style.position = "fixed";
      body.style.top = `-${y}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
    }

    return () => {
      const now = Number(body.dataset.sheetDepth ?? "1") - 1;
      body.dataset.sheetDepth = String(Math.max(0, now));
      if (now > 0) return;

      const y = Number(body.dataset.sheetScrollY ?? "0");
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      delete body.dataset.sheetDepth;
      delete body.dataset.sheetScrollY;
      window.scrollTo(0, y);
    };
  }, [open]);
}

/**
 * Everything an overlay needs to have the app properly behind it: the page
 * frozen, the back button closing it rather than navigating, and the app's
 * gestures standing down while it is up.
 *
 * Pair it with {...shieldProps} on the overlay's own root element.
 */
export function useOverlayShield(open: boolean, onClose: () => void) {
  useOverlayBackButton(open, onClose);
  useFrozenPage(open);
}

/**
 * Stop the gesture at the overlay's root.
 *
 * An overlay portals to <body>, so in the DOM it is outside everything. But
 * React dispatches events through the COMPONENT tree, and an overlay is
 * rendered by a feed card, a reel, a row — so every touch inside it was also
 * delivered to their handlers. Two fingers in the comments pinched the Shot
 * underneath; a sideways drag changed tab. Blocking each offender in turn is
 * endless, because the leak is structural: anything that renders an overlay
 * inherits it. One stop at the root closes all of them, including the ones
 * nobody has written yet.
 *
 * Children still get their events first — this only stops them going further
 * up, which is the part that was never wanted.
 */
export const shieldProps = {
  onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
  onTouchMove: (e: React.TouchEvent) => e.stopPropagation(),
  onTouchEnd: (e: React.TouchEvent) => e.stopPropagation(),
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onPointerMove: (e: React.PointerEvent) => e.stopPropagation(),
  onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
} as const;
