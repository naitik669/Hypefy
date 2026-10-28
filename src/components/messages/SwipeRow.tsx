"use client";

import { useEffect, useRef, useState } from "react";
import { Reply, Pencil } from "lucide-react";
import { ShareIcon } from "@/components/ui/ShareIcon";
import {
  SWIPE_MAX_PX,
  SWIPE_SLOP_PX,
  SWIPE_TRIGGER_PX,
  type SwipeAction,
  swipeLabel,
} from "@/lib/chat-gestures";

/**
 * A message row you can swipe.
 *
 * The thread is a vertical scroller first, so the gesture is not claimed
 * until the finger has gone SWIPE_SLOP_PX sideways *and* further sideways
 * than down. Until then every event passes through untouched and a flick
 * down the conversation does not nudge a bubble.
 *
 * **Nothing about the drag goes through React.** The first version kept the
 * live gesture in state, which cost two things. It re-rendered on the frame
 * the swipe was claimed — a hitch exactly where the movement starts, which
 * is the part a finger notices. And `onPointerUp` read the action out of
 * that state, so a quick flick, where claim and release land in the same
 * tick, found it still empty and did nothing: the swipe simply failed, more
 * often the faster you did it.
 *
 * So the action lives in a ref, the position is written straight to the
 * node inside one requestAnimationFrame, and the layer is promoted for the
 * length of the gesture. React renders once, when the icon appears.
 *
 * Only `transform` and `opacity` are animated. `clip-path` is not
 * composited in Android's WebView, so a reveal drawn by clipping repaints
 * the whole row every frame — the reason the music title had to be rebuilt.
 */
export function SwipeRow({
  actionFor,
  onAction,
  onClaim,
  children,
}: {
  /** What a swipe this way would do, or null for nothing. */
  actionFor: (direction: "left" | "right") => SwipeAction | null;
  onAction: (action: SwipeAction) => void;
  /** Called once the gesture is taken, so the row can drop its long-press. */
  onClaim: () => void;
  children: React.ReactNode;
}) {
  const slider = useRef<HTMLDivElement | null>(null);
  const glyph = useRef<HTMLSpanElement | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const claimed = useRef(false);
  const offset = useRef(0);
  /**
   * The action this gesture will perform.
   *
   * A ref, not state: it is read on release, and a flick fast enough to
   * claim and let go inside one tick would read state that had not landed
   * yet and do nothing.
   */
  const action = useRef<SwipeAction | null>(null);
  /** Whether the finger is currently past the point of no return. */
  const armed = useRef(false);
  const frame = useRef(0);
  const want = useRef(0);

  // Which glyph is showing, and on which side. The one piece of this that
  // has to be rendered, so it is set once per gesture and never during it.
  const [showing, setShowing] = useState<{ action: SwipeAction; side: "left" | "right" } | null>(
    null,
  );

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /** One write per frame, however many pointer events arrive. */
  function schedule() {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = slider.current;
      if (!el) return;
      el.style.transform = `translate3d(${want.current}px, 0, 0)`;
      const g = glyph.current;
      if (!g) return;
      // The icon fades in with the travel and settles at full size as the
      // trigger is passed, so the point where letting go does something can
      // be seen as well as felt.
      const reach = Math.min(1, Math.abs(want.current) / SWIPE_TRIGGER_PX);
      g.style.opacity = String(reach);
      g.style.transform = `scale(${0.7 + reach * 0.3})`;
    });
  }

  function settle() {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    const el = slider.current;
    if (el) {
      el.style.transition = reducedMotion()
        ? "none"
        : "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = "";
      // Dropped after the journey back, not during it: a layer promoted on
      // every row of a long thread is memory nobody asked for.
      window.setTimeout(() => {
        if (slider.current === el) el.style.willChange = "";
      }, 240);
    }
    start.current = null;
    claimed.current = false;
    armed.current = false;
    offset.current = 0;
    want.current = 0;
    action.current = null;
    setShowing(null);
  }

  function onPointerDown(e: React.PointerEvent) {
    // Mouse drags are not a gesture anybody makes on a desktop thread, and
    // a stray drag with the button down would fire actions.
    if (e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e: React.PointerEvent) {
    const from = start.current;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;

    if (!claimed.current) {
      // Sideways, and more sideways than down. Both halves matter: the
      // first stops a tap from counting, the second leaves scrolling alone.
      if (Math.abs(dx) < SWIPE_SLOP_PX || Math.abs(dx) <= Math.abs(dy)) return;
      const next = actionFor(dx > 0 ? "right" : "left");
      if (!next) {
        // No action this way, so the row does not move at all. Rubber-banding
        // open on nothing reads as a broken gesture rather than as a limit.
        start.current = null;
        return;
      }
      claimed.current = true;
      action.current = next;
      const el = slider.current;
      if (el) {
        // Set once, here. Writing the transition string on every move was a
        // style recalculation per frame for no change.
        el.style.transition = "none";
        el.style.willChange = "transform";
      }
      setShowing({ action: next, side: dx > 0 ? "left" : "right" });
      onClaim();
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }

    // Past the trigger it keeps moving, but at a third of the speed, so the
    // limit is felt as resistance rather than as a wall.
    const over = Math.max(0, Math.abs(dx) - SWIPE_TRIGGER_PX);
    const travel = Math.min(SWIPE_TRIGGER_PX + over / 3, SWIPE_MAX_PX);
    offset.current = dx > 0 ? travel : -travel;
    want.current = offset.current;

    // A tick the moment it becomes a real swipe, so the hand knows before
    // the eye does. Only on the way in — buzzing on every wobble over the
    // line is worse than not buzzing at all.
    const far = travel >= SWIPE_TRIGGER_PX;
    if (far && !armed.current) {
      armed.current = true;
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
    } else if (!far) {
      armed.current = false;
    }

    schedule();
  }

  function onPointerUp() {
    if (!claimed.current) {
      start.current = null;
      return;
    }
    const far = Math.abs(offset.current) >= SWIPE_TRIGGER_PX;
    const chosen = action.current;
    settle();
    if (far && chosen) onAction(chosen);
  }

  return (
    <div className="relative">
      {showing && (
        <span
          ref={glyph}
          aria-hidden
          style={{ opacity: 0, transform: "scale(0.7)", willChange: "opacity, transform" }}
          className={`pointer-events-none absolute inset-y-0 flex items-center text-accent ${
            showing.side === "left" ? "left-3" : "right-3"
          }`}
        >
          <SwipeGlyph action={showing.action} />
        </span>
      )}
      <div
        ref={slider}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={settle}
        // The browser keeps vertical scrolling; we only ever take the
        // horizontal part.
        style={{ touchAction: "pan-y" }}
      >
        {children}
      </div>
    </div>
  );
}

function SwipeGlyph({ action }: { action: SwipeAction }) {
  const label = swipeLabel(action);
  if (action === "reply") return <Reply size={18} aria-label={label} />;
  if (action === "edit") return <Pencil size={17} aria-label={label} />;
  return <ShareIcon size={18} weight="bold" aria-label={label} />;
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
