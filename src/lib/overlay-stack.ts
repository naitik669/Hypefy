"use client";

import { useEffect, useRef } from "react";

/**
 * Which overlays are open, innermost last.
 *
 * Android's back button has to dismiss the thing on top of the screen before
 * it navigates — otherwise pressing back with a sheet open routes the page
 * away *underneath* the sheet, and the overlay appears to take the whole
 * screen with it.
 *
 * A module-level stack rather than context: the back handler lives in
 * NativeShell, near the root, while overlays open anywhere below it. Context
 * would mean threading a provider through every subtree and re-rendering the
 * root each time a sheet opened, to communicate something no component needs
 * to render.
 */
type Entry = { id: number; close: () => void };

let stack: Entry[] = [];
let nextId = 1;

function pushOverlay(close: () => void): number {
  const id = nextId++;
  stack.push({ id, close });
  return id;
}

function popOverlay(id: number) {
  stack = stack.filter((e) => e.id !== id);
}

/**
 * Close the topmost overlay. Returns whether there was one.
 *
 * The caller uses the boolean to decide whether the back press was consumed,
 * so it must not also navigate.
 */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  // Popped here as well as in the hook cleanup: the close() call may be async
  // (an exit animation), and a second back press before the component
  // unmounts would otherwise close the same overlay twice and swallow a press.
  popOverlay(top.id);
  top.close();
  return true;
}

/** Test/debug helper — how many overlays are currently registered. */
export function overlayCount(): number {
  return stack.length;
}

/**
 * Register an overlay for as long as it is open.
 *
 * Drop into any component that already has `open` / `onClose`:
 *
 *     useOverlayBackButton(open, onClose);
 */
export function useOverlayBackButton(open: boolean, onClose: () => void) {
  // onClose is nearly always an inline arrow, so it is a new function every
  // render. Held in a ref so the registration effect depends only on `open` —
  // otherwise the overlay would unregister and re-register on every parent
  // render, and could be missing from the stack at the moment back is pressed.
  const latest = useRef(onClose);
  useEffect(() => { latest.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const id = pushOverlay(() => latest.current());
    return () => popOverlay(id);
  }, [open]);
}
