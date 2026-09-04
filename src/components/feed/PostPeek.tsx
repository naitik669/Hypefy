"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useOverlayBackButton } from "@/lib/overlay-stack";

/**
 * Hold a photo to lift it off the feed.
 *
 * Deliberately NOT the full-screen viewer. A peek answers "what is that?"
 * without leaving the feed — it keeps the card's rounded frame and sits at
 * roughly the size the post already occupies, rather than sending you to a
 * black full-bleed screen for a much smaller question.
 *
 * It STAYS once opened. It used to close on release, which meant reading it
 * with your thumb parked on the screen and losing it the moment you moved —
 * you could not look at the thing you had asked to look at. Now the hold
 * opens it and a tap anywhere (or back, or Escape) closes it.
 */
/**
 * How long to ignore taps after opening. Comfortably past the synthetic
 * click browsers emit after a touch release (~300ms), so the release that
 * opened the peek cannot also close it.
 */
const ARM_MS = 420;

export function PostPeek({ src, onClose }: { src: string; onClose: () => void }) {
  const [shown, setShown] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setArmed(true), ARM_MS);
    return () => clearTimeout(id);
  }, []);

  // Rendered only while held, so being mounted is being open. Registering
  // with the overlay stack keeps the tab-swipe and the reel underneath from
  // treating the same touch as theirs.
  useOverlayBackButton(true, onClose);

  // One frame at the small size, then grow. Mounting straight into the final
  // transform would skip the transition entirely and it would just appear.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      /* p-3, not p-6. The card is only mx-4 from the screen edge, so with
         24px of padding here the "expanded" photo came out NARROWER than the
         one it expanded from — measured at 342px against the card's 358 on a
         390px screen. A peek that shrinks the picture is worse than no peek. */
      className="fixed inset-0 z-[300] flex items-center justify-center p-3"
      // Ignored until the opening gesture is over. The hold that opens this
      // is still in progress, and its release lands here — as a touchend,
      // and then as the synthetic click browsers fire a moment later on
      // whatever is under the finger. Without the guard the peek closed
      // itself on the very gesture that opened it.
      onClick={() => {
        if (armed) onClose();
      }}
      onTouchEnd={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      style={{
        background: `rgba(0,0,0,${shown ? 0.72 : 0})`,
        transition: "background 180ms ease-out",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Photo preview"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        /* object-contain is the real gain, not raw size. A feed card crops to
           its composed aspect ratio with object-cover, so a wide or tall post
           is showing you part of itself; this shows all of it. On a phone the
           card is already nearly full width, so there is little room to grow
           — what the peek adds is the whole picture, lifted, with everything
           else dimmed out. */
        className="max-h-[82vh] max-w-full rounded-3xl object-contain shadow-2xl ring-1 ring-white/10"
        style={{
          // Rises from just under its resting size, which reads as the card
          // lifting rather than a new thing appearing.
          transform: shown ? "scale(1)" : "scale(0.92)",
          opacity: shown ? 1 : 0,
          transition:
            "transform 200ms cubic-bezier(0.16,1,0.3,1), opacity 140ms ease-out",
        }}
      />
    </div>,
    document.body
  );
}
