"use client";

import { useCallback, useEffect, useRef } from "react";

/** How long a press has to last. Longer than NavHoldMenu's 320ms: this sits
 *  on a button whose tap does something, so a slow tap must stay a tap. */
const HOLD_MS = 450;
/** Movement that turns the press into a scroll. */
const SLOP_PX = 10;

/**
 * A long press on something that is also tapped.
 *
 * Spread the returned handlers on the button, next to its onClick. A tap
 * reaches onClick as normal; a hold fires `onHold` and swallows the click the
 * release would send, so holding the bookmark opens the folders without also
 * saving or unsaving. A finger that moves is scrolling and cancels the hold.
 *
 * Right-click does the same as a hold, so the folders are reachable with a
 * mouse, and the phone's own long-press menu never appears over the button.
 */
export function useLongPress(onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const from = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  const hold = useRef(onHold);
  useEffect(() => {
    hold.current = onHold;
  });

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  return {
    onPointerDown(e: React.PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      held.current = false;
      from.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        held.current = true;
        hold.current();
      }, HOLD_MS);
    },
    onPointerMove(e: React.PointerEvent) {
      if (!timer.current) return;
      if (Math.abs(e.clientX - from.current.x) > SLOP_PX || Math.abs(e.clientY - from.current.y) > SLOP_PX) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu(e: React.MouseEvent) {
      e.preventDefault();
      // A touch hold raises contextmenu too, after the timer has already fired.
      if (held.current) return;
      clear();
      held.current = true;
      hold.current();
    },
    onClickCapture(e: React.MouseEvent) {
      if (!held.current) return;
      held.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    style: { WebkitTouchCallout: "none", userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties,
  };
}
