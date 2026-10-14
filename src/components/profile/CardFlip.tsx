"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { RotateCw } from "lucide-react";

/** The flip, and the height change underneath it, share one duration. */
const FLIP_MS = 680;
/**
 * Slow at both ends, quick through the middle.
 *
 * The first attempt used the app's usual ease-out, which puts three
 * quarters of the rotation in the first fifth of the time: the card
 * snapped past edge-on before the eye had registered that it was turning,
 * and the remaining half second was spent creeping the last few degrees.
 * A card in a hand accelerates away from rest and settles into the stop.
 */
const EASE = "cubic-bezier(0.58, 0.02, 0.22, 1)";

/**
 * A card with two faces, turned over on its vertical axis.
 *
 * Three things together make it read as a real card rather than a tab
 * switch. It rotates in perspective, so the near edge grows as the far edge
 * shrinks. It lifts towards you through the middle of the turn, which is
 * what a hand does with a card and what a page does as it leaves the spine.
 * And the card's height travels with it, so a shorter back does not snap
 * into place after the rotation has finished.
 *
 * The faces are both mounted the whole time — a back face built only when
 * you ask for it would be a blank rectangle for the first half of its own
 * entrance, and the QR on it takes a frame to draw.
 */
export function FlipCard({
  flipped,
  front,
  back,
  label,
}: {
  flipped: boolean;
  front: ReactNode;
  back: ReactNode;
  /** Announced to a screen reader, which gets no perspective. */
  label: string;
}) {
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const inner = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    const el = flipped ? backRef.current : frontRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    // Faces grow after mount — a photo loads, the QR appears, a bio wraps.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [flipped]);

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

  const motion = reduced
    ? // Straight swap. The rotation is the whole point of the effect, so
      // there is nothing to soften — it is removed and the faces cross-fade.
      { transform: "none", transition: `opacity ${FLIP_MS / 3}ms linear` }
    : {
        transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        transition: `transform ${FLIP_MS}ms ${EASE}`,
      };

  return (
    <div
      style={{ perspective: 1900, height: height ?? undefined }}
      className="transition-[height] duration-[680ms] ease-[cubic-bezier(0.58,0.02,0.22,1)]"
    >
      <div
        ref={inner}
        className="relative"
        style={{ transformStyle: "preserve-3d", ...motion }}
        aria-live="polite"
        aria-label={label}
      >
        <Face hidden={flipped} reduced={reduced} ref={frontRef}>
          {front}
        </Face>
        <Face hidden={!flipped} reduced={reduced} back ref={backRef}>
          {back}
        </Face>
      </div>
    </div>
  );
}

/**
 * One side.
 *
 * The front stays in the flow so the card has a height before anything has
 * been measured; the back is laid over it. Both are hidden from the reader
 * and from taps while they are facing away — backface-visibility keeps the
 * mirrored face off the screen, but it does not stop a finger landing on a
 * link that is pointing away from it.
 */
function Face({
  children,
  hidden,
  reduced,
  back = false,
  ref,
}: {
  children: ReactNode;
  hidden: boolean;
  reduced: boolean;
  back?: boolean;
  ref: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      inert={hidden}
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        transform: back && !reduced ? "rotateY(180deg)" : undefined,
        opacity: reduced && hidden ? 0 : 1,
      }}
      className={back ? "absolute inset-x-0 top-0" : ""}
    >
      {children}
    </div>
  );
}

/**
 * The strip along the foot of each face: what is on the other side, and the
 * way to get there.
 *
 * Inside the card rather than under it. The actions used to be a row of
 * pills floating below, which looked like part of the browser and ended up
 * in every screenshot of a card that exists to be screenshotted.
 */
export function FlipStrip({
  side,
  onFlip,
}: {
  side: "front" | "back";
  onFlip: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onFlip}
      className="mt-1 flex w-full items-center gap-2 border-t border-white/10 px-2 pb-1 pt-3 text-left transition hover:opacity-80 active:scale-[0.99]"
    >
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
        {side === "front" ? "Hypefy ID" : "Profile"}
      </span>
      <RotateCw size={13} strokeWidth={2.6} className="ml-auto text-white/60" aria-hidden />
      <span className="sr-only">
        {side === "front" ? "Turn the card over to the Hypefy ID" : "Turn the card back to the profile"}
      </span>
    </button>
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
