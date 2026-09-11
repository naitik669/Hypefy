"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus management for overlays. When `active`, moves focus into the returned
 * container, keeps Tab/Shift+Tab cycling within it, and restores focus to the
 * previously-focused element on close. Returns a ref to attach to the overlay's
 * container element.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const prevFocused = document.activeElement as HTMLElement | null;

    // Move focus onto the CONTAINER, not the first item: focusing a button
    // programmatically can trigger the global focus-visible accent ring on a
    // menu nobody keyboarded into (it shows up as a stray lime line). The
    // container is invisible to the ring; pressing Tab from it enters the
    // items and rings them legitimately.
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
    container.setAttribute("tabindex", "-1");
    container.style.outline = "none";
    // Unless something inside already took it: a field with autoFocus is
    // focused as it mounts, before this runs, and taking focus back from it
    // left the name field of a sheet unfocused and ignoring the keyboard.
    if (!container.contains(document.activeElement)) container.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === firstEl || !container!.contains(activeEl)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else if (activeEl === lastEl || !container!.contains(activeEl)) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      // Restore focus only if it's still meaningful (element in the document).
      if (prevFocused && document.contains(prevFocused)) prevFocused.focus();
    };
  }, [active]);

  return ref;
}
