"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** How long the turn takes, and the lift that runs alongside it. */
const FLIP_MS = 680;
/**
 * Slow at both ends, quick through the middle.
 *
 * The app's usual ease-out puts three quarters of the rotation in the first
 * fifth of the time: the card snapped past edge-on before the eye had
 * registered that it was turning, and the rest of the half second went on
 * creeping the last few degrees. A card in a hand accelerates away from
 * rest and settles into the stop.
 */
const EASE = "cubic-bezier(0.58, 0.02, 0.22, 1)";

/** How far across the card a drag has to get before releasing completes the turn. */
const COMMIT = 0.3;
/** Or how fast it has to be going, in card-widths a second, however short. */
const FLICK = 0.9;
/** Below this the gesture is a scroll, and the card lets go of it. */
const AXIS_LOCK_PX = 10;

/**
 * A card with two faces, turned over on its vertical axis.
 *
 * Three things together make it read as a real card rather than a tab
 * switch. It rotates in perspective, so the near edge grows as the far edge
 * shrinks. It lifts towards you through the middle of the turn, which is
 * what a hand does with a card. And it follows a finger: a drag across it
 * turns it by as much as the finger has travelled, and letting go either
 * completes the turn or drops it back.
 *
 * Both faces are mounted the whole time. A back face built only when asked
 * for would be a blank rectangle through the first half of its own
 * entrance, and the code on it takes a frame to draw.
 *
 * The app's own tab swipe is already off here: the card registers on the
 * overlay stack, and gestureBlocked refuses while anything is open.
 */
export function FlipCard({
  flipped,
  onToggle,
  front,
  back,
  label,
}: {
  flipped: boolean;
  onToggle: () => void;
  front: ReactNode;
  back: ReactNode;
  /** Announced to a screen reader, which gets no perspective. */
  label: string;
}) {
  const inner = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const mounted = useRef(false);

  /** How far through a turn the finger has taken it, -1 to 1. Zero when nobody is touching. */
  const [drag, setDrag] = useState(0);
  const gesture = useRef<{ x: number; y: number; t: number; axis: null | "x" | "y"; w: number } | null>(null);
  /**
   * A drag that began on something tappable still ends in a click.
   *
   * Most of the front is the photograph, and the photograph is a button
   * that opens it full screen — so swiping the card over from the most
   * natural place to put a thumb both turned the card and opened the
   * photo. The browser suppresses the click only when it decides the
   * gesture was a scroll, and this one is neither axis it knows about.
   */
  const swiped = useRef(false);

  /**
   * The lift, started by hand.
   *
   * A CSS animation only plays again if something about it changes, and
   * this one has to play on every turn of the same element in both
   * directions. Clearing it, forcing a reflow and setting it back is the
   * way to say "again" — and doing it here rather than in the style means
   * it does not also fire on mount, when there has been no turn.
   */
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (reduced) return;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = `card-lift ${FLIP_MS}ms ${EASE}`;
  }, [flipped, reduced]);

  function onClickCapture(e: React.MouseEvent) {
    if (!swiped.current) return;
    swiped.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  function onTouchStart(e: React.TouchEvent) {
    swiped.current = false;
    const t = e.touches[0];
    gesture.current = {
      x: t.clientX,
      y: t.clientY,
      t: Date.now(),
      axis: null,
      w: e.currentTarget.clientWidth || 1,
    };
  }

  function onTouchMove(e: React.TouchEvent) {
    const g = gesture.current;
    if (!g || reduced) return;
    const t = e.touches[0];
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      // Whichever way it went first wins, and a vertical one is the page
      // scrolling — the card keeps its hands off it from then on.
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (g.axis === "x") swiped.current = true;
    }
    if (g.axis !== "x") return;
    // Dragging left turns it forward. Clamped so neither face can be pushed
    // past flat into a rotation it would then have to unwind.
    const raw = -dx / g.w;
    setDrag(flipped ? Math.min(0, Math.max(-1, raw)) : Math.max(0, Math.min(1, raw)));
  }

  function onTouchEnd() {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.axis !== "x") return;
    const travelled = Math.abs(drag);
    // A short flick counts as much as a long drag: the card should not need
    // to be dragged a third of the way across to turn over.
    const speed = (travelled / Math.max(1, Date.now() - g.t)) * 1000;
    setDrag(0);
    if (travelled >= COMMIT || speed >= FLICK) onToggle();
  }

  const dragging = drag !== 0;
  const motion = reduced
    ? // The rotation is the whole effect, so there is nothing to soften —
      // it is removed and the faces cross-fade instead.
      { transform: "none", transition: `opacity ${FLIP_MS / 3}ms linear` }
    : {
        transform: `rotateY(${(flipped ? 180 : 0) + drag * 180}deg)`,
        transition: dragging ? "none" : `transform ${FLIP_MS}ms ${EASE}`,
      };

  return (
    <div
      style={{ perspective: 1900 }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onClickCapture={onClickCapture}
    >
      {/* One grid cell holding both faces. The row is as tall as the
          taller of them and stretches the other to match, so the card
          cannot change size when you turn it over and nothing has to be
          measured to make that true. */}
      <div
        ref={inner}
        className="grid"
        style={{ transformStyle: "preserve-3d", ...motion }}
        aria-live="polite"
        aria-label={label}
      >
        <Face hidden={flipped} reduced={reduced}>
          {front}
        </Face>
        <Face hidden={!flipped} reduced={reduced} back>
          {back}
        </Face>
      </div>
    </div>
  );
}

/**
 * One side.
 *
 * Both sit in the same grid cell, so both are exactly as tall as the
 * taller one. Each is taken out of the reader and out of reach while it
 * faces away — backface-visibility keeps the mirrored face off the screen,
 * but it does not stop a finger landing on a link pointing away from it.
 */
function Face({
  children,
  hidden,
  reduced,
  back = false,
}: {
  children: ReactNode;
  hidden: boolean;
  reduced: boolean;
  back?: boolean;
}) {
  return (
    <div
      inert={hidden}
      style={{
        gridArea: "1 / 1",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        transform: back && !reduced ? "rotateY(180deg)" : undefined,
        opacity: reduced && hidden ? 0 : 1,
      }}
    >
      {children}
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}
