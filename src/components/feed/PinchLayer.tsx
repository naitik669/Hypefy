"use client";

import { createPortal } from "react-dom";

/**
 * The photo, lifted out of its card for the duration of a pinch.
 *
 * Rendered in a portal rather than transformed in place, and not for tidiness
 * — in place it CANNOT escape. FeedList virtualises with
 * `content-visibility: auto`, which implies paint containment, so every card
 * clips its own contents to its own box no matter what overflow the gallery
 * inside it asks for. Raising z-index does not help either: a contained
 * ancestor is the end of the line.
 *
 * So the layer starts life exactly on top of the card's rect at scale 1 —
 * indistinguishable from the photo it covers — and grows from there, over
 * everything, out past the borders.
 *
 * The backdrop fades in with the zoom rather than snapping on, so a gentle
 * pinch does not flash the whole screen dark for a gesture that was barely a
 * gesture.
 */
export function PinchLayer({
  src,
  rect,
  scale,
  x,
  y,
  settling,
  radius = 16,
}: {
  src: string;
  /** Where the photo sits on screen, measured when the pinch began. */
  rect: { left: number; top: number; width: number; height: number };
  scale: number;
  x: number;
  y: number;
  /** Fingers have left — animate home instead of tracking them. */
  settling: boolean;
  radius?: number;
}) {
  if (typeof document === "undefined") return null;

  const dim = Math.min(Math.max(scale - 1, 0) / 1.2, 1) * 0.72;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[290]" aria-hidden>
      <div
        className="absolute inset-0 bg-black"
        style={{
          opacity: dim,
          transition: settling ? "opacity 240ms ease-out" : "none",
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="absolute object-cover"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          borderRadius: radius,
          transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
          // Tracks the fingers exactly while they are down; springs home on
          // its own once they leave.
          transition: settling
            ? "transform 240ms cubic-bezier(0.16,1,0.3,1)"
            : "none",
          willChange: "transform",
        }}
      />
    </div>,
    document.body
  );
}
