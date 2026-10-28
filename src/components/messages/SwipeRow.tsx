"use client";

import { useEffect, useRef, useState } from "react";
import { Reply, Pencil } from "lucide-react";
import { ShareIcon } from "@/components/ui/ShareIcon";
import {
  SWIPE_SLOP_PX,
  SWIPE_TRIGGER_PX,
  type SwipeAction,
  swipeLabel,
  swipeTravel,
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
 * length of the gesture. React renders once, when the mark appears.
 *
 * **Only `transform` and `opacity` are written per frame.** Everything else
 * is a paint. The version before this one lerped the mark's background and
 * its arrow colour on every frame, which repainted it sixty times a second
 * for a change nobody could name — and that was the chop. `clip-path` is
 * not composited in Android's WebView either, which is why the music title
 * had to be rebuilt. The rule holds for colour just as much.
 *
 * So the mark is two layers and tells the gesture in two beats:
 *
 *   1. **The arrow arrives by moving.** It slides in from the edge as the
 *      bubble leaves it, tracking the finger. Position and opacity only.
 *   2. **The plate grows behind it at the trigger**, which is the moment
 *      letting go starts to mean something. That is a state, not a ramp,
 *      so it is written once when the gesture arms and once when it
 *      disarms, and CSS carries it the rest of the way.
 */

/** How far out the arrow starts before it slides into place. */
const ARROW_TRAVEL_PX = 22;
/** The plate catching rather than merely stopping. */
const PLATE_EASE =
  "transform 240ms cubic-bezier(.34,1.56,.64,1), opacity 140ms ease";
/** The arrow's colour is the only paint, and it happens twice a gesture. */
const GLYPH_EASE = "color 140ms ease";

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
  const plate = useRef<HTMLSpanElement | null>(null);
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
  /** Which side the mark is on, read inside the frame without a render. */
  const side = useRef<"left" | "right">("left");
  /**
   * Which gesture this is.
   *
   * The mark is held for the length of its fade rather than torn off the
   * moment the finger lifts, and a new swipe must not have the previous
   * one's cleanup land on top of it.
   */
  const gen = useRef(0);

  // Which glyph is showing, and on which side. The one piece of this that
  // has to be rendered, so it is set once per gesture and never during it.
  const [showing, setShowing] = useState<{ action: SwipeAction; side: "left" | "right" } | null>(
    null,
  );

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /**
   * Past the trigger, or back below it.
   *
   * Written when it changes and not before: this is the one place the
   * mark paints, and a gesture crosses the line once or twice, not sixty
   * times a second.
   */
  function setArmed(on: boolean) {
    const p = plate.current;
    if (p) {
      p.style.transform = on ? "scale(1)" : "scale(0.2)";
      p.style.opacity = on ? "1" : "0";
    }
    const g = glyph.current;
    // Deep lime on the lime plate, white on the thread behind it.
    if (g) g.style.color = on ? "var(--color-accent-deep)" : "#ffffff";
  }

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
      const reach = Math.min(1, Math.abs(want.current) / SWIPE_TRIGGER_PX);
      // The arrow comes in from the edge the bubble is moving away from,
      // and is in place by the time the swipe is far enough. Nothing here
      // is a paint: the browser can run both of these on the compositor.
      const out = (1 - reach) * (side.current === "left" ? -ARROW_TRAVEL_PX : ARROW_TRAVEL_PX);
      g.style.transform = `translate3d(${out}px, 0, 0)`;
      // Slightly ahead of the travel, so it is readable before it lands
      // rather than arriving at full strength in the last few pixels.
      g.style.opacity = String(Math.min(1, reach * 1.6));
    });
  }

  function settle() {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    // The mark leaves the way it arrived rather than blinking out from
    // under the bubble that is still travelling home.
    const g = glyph.current;
    if (g) {
      g.style.transition = `opacity 180ms ease, transform 240ms cubic-bezier(.22,1,.36,1), ${GLYPH_EASE}`;
      g.style.opacity = "0";
      g.style.transform = `translate3d(${
        side.current === "left" ? -ARROW_TRAVEL_PX : ARROW_TRAVEL_PX
      }px, 0, 0)`;
    }
    setArmed(false);
    const mine = ++gen.current;
    window.setTimeout(() => {
      // Only if nothing has started since: a second swipe must not have
      // the first one's tidying land on top of it.
      if (gen.current === mine) setShowing(null);
    }, 240);
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
      side.current = dx > 0 ? "left" : "right";
      gen.current++;
      const g = glyph.current;
      // Whatever is left of the last gesture's fade is dropped: the arrow
      // has to follow the finger, not finish the previous animation. Its
      // colour keeps its own transition, which is not per-frame.
      if (g) g.style.transition = GLYPH_EASE;
      const el = slider.current;
      if (el) {
        // Set once, here. Writing the transition string on every move was a
        // style recalculation per frame for no change.
        el.style.transition = "none";
        el.style.willChange = "transform";
      }
      setShowing({ action: next, side: side.current });
      onClaim();
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }

    // Under the finger to the trigger, then resisting. See swipeTravel:
    // the old line here could not return less than the trigger, so the
    // bubble jumped the whole way the moment the gesture was claimed.
    const travel = swipeTravel(Math.abs(dx));
    offset.current = dx > 0 ? travel : -travel;
    want.current = offset.current;

    // A tick the moment it becomes a real swipe, so the hand knows before
    // the eye does. Only on the way in — buzzing on every wobble over the
    // line is worse than not buzzing at all.
    const far = travel >= SWIPE_TRIGGER_PX;
    if (far !== armed.current) {
      armed.current = far;
      setArmed(far);
      if (far && typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
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
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 my-auto flex h-9 w-9 items-center justify-center ${
            showing.side === "left" ? "left-3" : "right-3"
          }`}
        >
          {/* The plate. A squircle, not a circle — the same corner the
              avatars and the music case use, so the mark belongs to Hypefy
              rather than to the gesture. It is not drawn until the swipe
              is far enough, which is the whole of what it says. */}
          <span
            ref={plate}
            style={{
              opacity: 0,
              transform: "scale(0.2)",
              transition: PLATE_EASE,
              backgroundColor: "var(--color-accent)",
              willChange: "transform, opacity",
            }}
            className="absolute inset-0 rounded-[32%]"
          />
          <span
            ref={glyph}
            style={{
              opacity: 0,
              transform: "translate3d(0, 0, 0)",
              color: "#ffffff",
              transition: GLYPH_EASE,
              willChange: "transform, opacity",
            }}
            className="relative flex items-center justify-center"
          >
            <SwipeGlyph action={showing.action} />
          </span>
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

/**
 * The arrow itself, taking its colour from the layer around it — so the
 * one write that turns it deep-lime needs to touch nothing else.
 */
function SwipeGlyph({ action }: { action: SwipeAction }) {
  const label = swipeLabel(action);
  if (action === "reply") return <Reply size={19} strokeWidth={2.4} aria-label={label} />;
  if (action === "edit") return <Pencil size={17} strokeWidth={2.4} aria-label={label} />;
  return <ShareIcon size={18} weight="bold" aria-label={label} />;
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
