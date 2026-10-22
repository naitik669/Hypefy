"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { haptics } from "@/lib/haptics";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import { PinBoard } from "@/components/messages/PinBoard";
import { pinAxis, pinDragProgress, pinSwipeOutcome } from "@/lib/chat-pins";

/**
 * The pin board as the chat's second pane.
 *
 * A chat and its board are two halves of one screen, moved between
 * sideways: the board follows the finger in from the right and back out
 * again, the way the tabs do, rather than being a page you navigate to and
 * return from. It was a route first, and the route was the wrong shape — a
 * board you *go to* feels like a different part of the app, when it is the
 * same conversation looked at another way.
 *
 * The thread stays mounted behind it, which is what makes tapping a pinned
 * card able to simply close the pane and reach the message that is already
 * on screen.
 */

const SETTLE = "transform 280ms cubic-bezier(0.16, 1, 0.3, 1)";

type Drag = { x: number; y: number; at: number; axis: null | "x" | "y" };

/**
 * The pane's state and the handlers both sides need.
 *
 * `threadHandlers` go on the thread's scroller, `paneHandlers` on the pane.
 * One hook owns both because they are one gesture with two starting points,
 * and the progress they share is what keeps the two panes moving together.
 */
export function usePinPane(threadScroller: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** Mounted a touch early and unmounted late, so the slide is visible both ways. */
  const [mounted, setMounted] = useState(false);
  const drag = useRef<Drag | null>(null);
  /**
   * Open is both: state, because it decides what is rendered, and a ref,
   * because the touch handlers are created once per render and would
   * otherwise read whatever it was when the gesture began.
   */
  const [isOpen, setIsOpen] = useState(false);
  const openRef = useRef(false);
  const setOpen = useCallback((v: boolean) => {
    openRef.current = v;
    setIsOpen(v);
  }, []);

  const open = useCallback(() => {
    setMounted(true);
    setOpen(true);
    // Next frame, so the pane has been laid out off-screen and the move to 1
    // is a transition rather than an appearance.
    requestAnimationFrame(() => setProgress(1));
  }, [setOpen]);

  const close = useCallback(() => {
    setOpen(false);
    setProgress(0);
  }, [setOpen]);

  // Once it has slid out, it can go. Kept mounted while open so the board
  // does not re-read its pins every time it is glanced at.
  useEffect(() => {
    if (progress !== 0 || dragging || isOpen) return;
    const t = setTimeout(() => setMounted(false), 320);
    return () => clearTimeout(t);
  }, [progress, dragging, isOpen]);

  useOverlayBackButton(mounted && isOpen, close);

  /**
   * Keep the pane under the finger from scrolling the list it is over.
   *
   * Both panes scroll vertically, and a React touch handler is passive, so
   * the browser has already begun scrolling by the time we know the drag is
   * sideways. Taking the scroller's overflow away for the length of the drag
   * is the only thing that reaches it — the same move SwipeNav makes on the
   * document.
   */
  function freeze(on: boolean) {
    for (const el of [threadScroller.current, document.querySelector<HTMLElement>("[data-pin-scroll]")]) {
      if (el) el.style.overflowY = on ? "hidden" : "";
    }
  }

  function start(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t || e.touches.length > 1) { drag.current = null; return; }
    drag.current = { x: t.clientX, y: t.clientY, at: Date.now(), axis: null };
  }

  function move(e: React.TouchEvent) {
    const d = drag.current;
    const t = e.touches[0];
    if (!d || !t) return;
    const dx = t.clientX - d.x;
    const dy = t.clientY - d.y;
    if (d.axis === null) {
      d.axis = pinAxis(dx, dy);
      if (d.axis === null) return;
      if (d.axis === "y") { drag.current = null; return; }
      // Wrong way for the state we are in: nothing to drag towards.
      if (!openRef.current && dx > 0) { drag.current = null; return; }
      if (openRef.current && dx < 0) { drag.current = null; return; }
      if (!openRef.current) setMounted(true);
      setDragging(true);
      freeze(true);
    }
    setProgress(pinDragProgress(dx, window.innerWidth, openRef.current));
  }

  function end(e: React.TouchEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== "x") return;
    const t = e.changedTouches[0];
    setDragging(false);
    freeze(false);
    if (!t) { setProgress(openRef.current ? 1 : 0); return; }
    const outcome = pinSwipeOutcome({
      dx: t.clientX - d.x,
      width: window.innerWidth,
      elapsed: Date.now() - d.at,
      open: openRef.current,
    });
    if (outcome === "open") { haptics.tap(); open(); return; }
    if (outcome === "close") { haptics.tap(); close(); return; }
    setProgress(openRef.current ? 1 : 0);
  }

  const handlers = { onTouchStart: start, onTouchMove: move, onTouchEnd: end, onTouchCancel: end };

  return {
    progress,
    dragging,
    mounted,
    isOpen,
    open,
    close,
    threadHandlers: handlers,
    paneHandlers: handlers,
  };
}

export function PinPane({
  pane,
  conversationId,
  me,
  people,
  isGroup,
  onOpenMessage,
}: {
  pane: ReturnType<typeof usePinPane>;
  conversationId: string;
  me: string;
  people: Record<string, { name: string }>;
  isGroup: boolean;
  onOpenMessage: (messageId: string) => void;
}) {
  if (!pane.mounted) return null;
  return (
    <div
      {...pane.paneHandlers}
      className="absolute inset-0 z-[120] will-change-transform"
      style={{
        transform: `translateX(${(1 - pane.progress) * 100}%)`,
        transition: pane.dragging ? "none" : SETTLE,
        // A hairline down the leading edge, so the two panes read as beside
        // each other rather than one bleeding into the other mid-drag.
        boxShadow: "-1px 0 0 0 var(--color-border), -18px 0 36px -12px rgba(0,0,0,0.7)",
      }}
    >
      <PinBoard
        conversationId={conversationId}
        me={me}
        people={people}
        isGroup={isGroup}
        onBack={pane.close}
        onOpenMessage={(id) => {
          pane.close();
          onOpenMessage(id);
        }}
      />
    </div>
  );
}
