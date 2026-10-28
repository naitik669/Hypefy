"use client";

import { useRef, useState } from "react";
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
 * Only `transform` and `opacity` move. `clip-path` is not composited in
 * Android's WebView, so a reveal drawn by clipping repaints the whole row
 * every frame — the reason the music title's animation had to be rebuilt.
 * Here the icon simply sits under the row and the row slides off it.
 *
 * Nothing here is the only way to reach anything: reply, edit and forward
 * are all in the hold menu, which every row exposes through a focusable
 * button. A swipe is a shortcut.
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
  const start = useRef<{ x: number; y: number } | null>(null);
  const claimed = useRef(false);
  const offset = useRef(0);
  // Which icon is showing. One re-render per gesture, at the moment it is
  // claimed — the drag itself writes transforms straight to the node rather
  // than setting state sixty times a second.
  const [showing, setShowing] = useState<{ action: SwipeAction; side: "left" | "right" } | null>(
    null,
  );

  function paint(dx: number, smooth: boolean) {
    const el = slider.current;
    if (!el) return;
    el.style.transition = smooth ? "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)" : "none";
    el.style.transform = dx === 0 ? "" : `translate3d(${dx}px, 0, 0)`;
  }

  function release() {
    start.current = null;
    claimed.current = false;
    offset.current = 0;
    setShowing(null);
    paint(0, !reducedMotion());
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
      const action = actionFor(dx > 0 ? "right" : "left");
      if (!action) {
        // No action this way, so the row does not move at all. Rubber-banding
        // open on nothing reads as a broken gesture rather than as a limit.
        start.current = null;
        return;
      }
      claimed.current = true;
      // The icon sits on the side the row is coming from.
      setShowing({ action, side: dx > 0 ? "left" : "right" });
      onClaim();
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }

    // Past the trigger it keeps moving, but at a third of the speed, so the
    // point where letting go does something can be felt rather than read.
    const over = Math.max(0, Math.abs(dx) - SWIPE_TRIGGER_PX);
    const travel = Math.min(SWIPE_TRIGGER_PX + over / 3, SWIPE_MAX_PX);
    offset.current = dx > 0 ? travel : -travel;
    paint(offset.current, false);
  }

  function onPointerUp() {
    if (!claimed.current) {
      start.current = null;
      return;
    }
    const far = Math.abs(offset.current) >= SWIPE_TRIGGER_PX;
    const action = showing?.action ?? null;
    release();
    if (far && action) {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
      onAction(action);
    }
  }

  return (
    <div className="relative">
      {showing && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 flex items-center text-accent ${
            showing.side === "left" ? "left-2" : "right-2"
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
        onPointerCancel={release}
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
  if (action === "reply") return <Reply size={17} aria-label={label} />;
  if (action === "edit") return <Pencil size={16} aria-label={label} />;
  return <ShareIcon size={17} weight="bold" aria-label={label} />;
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
