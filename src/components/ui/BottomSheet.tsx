"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useOverlayBackButton } from "@/lib/overlay-stack";

/**
 * Slide-up bottom sheet rendered via createPortal at document.body.
 * This avoids stacking context issues — the sheet always overlays
 * everything regardless of where in the component tree it lives.
 */
/** How far down the sheet must be dragged before letting go dismisses it. */
const DISMISS_PX = 110;

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const trapRef = useFocusTrap<HTMLDivElement>(mounted && open);

  // Android hardware back closes the sheet before it navigates.
  useOverlayBackButton(mounted && open, onClose);

  /**
   * Freeze the page behind the sheet.
   *
   * The backdrop catches taps, but not a drag: a swipe on a non-scrollable
   * overlay chains to the nearest scrollable ancestor, which is the document
   * — so the feed carried on scrolling underneath whatever was being read.
   *
   * position:fixed rather than overflow:hidden because iOS ignores the
   * latter on body; the scroll offset is stashed and restored so closing the
   * sheet does not fling you back to the top of the feed.
   *
   * Counted, because sheets stack — a GIF picker over comments closing must
   * not unlock the page while the comments are still open.
   */
  useEffect(() => {
    if (!open) return;

    const body = document.body;
    const depth = Number(body.dataset.sheetDepth ?? "0");
    body.dataset.sheetDepth = String(depth + 1);

    if (depth === 0) {
      const y = window.scrollY;
      body.dataset.sheetScrollY = String(y);
      body.style.position = "fixed";
      body.style.top = `-${y}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
    }

    return () => {
      const now = Number(body.dataset.sheetDepth ?? "1") - 1;
      body.dataset.sheetDepth = String(Math.max(0, now));
      if (now > 0) return;

      const y = Number(body.dataset.sheetScrollY ?? "0");
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      delete body.dataset.sheetDepth;
      delete body.dataset.sheetScrollY;
      window.scrollTo(0, y);
    };
  }, [open]);

  /**
   * Drag the sheet down to dismiss it.
   *
   * Only from the top of its scroll. The sheet body scrolls, and a downward
   * drag partway through a long thread means "scroll up" — pulling the whole
   * sheet off screen instead would make it impossible to read anything
   * below the first screenful. So the gesture is only claimed once there is
   * nowhere left to scroll, which is also the moment the drag would
   * otherwise do nothing.
   *
   * Downward only: dragging up is the scroll's business, always.
   */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragFrom = useRef<number | null>(null);

  function onDragStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    // Read the scroll position at TOUCHSTART, not during the move. By the
    // time a finger has travelled the sheet may have scrolled to the top on
    // its own, and the gesture would convert to a dismiss mid-scroll.
    if ((scrollRef.current?.scrollTop ?? 0) > 0) {
      dragFrom.current = null;
      return;
    }
    dragFrom.current = e.touches[0].clientY;
  }

  function onDragMove(e: React.TouchEvent) {
    if (dragFrom.current === null || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - dragFrom.current;
    if (dy <= 0) {
      // Pulled back up past the start — hand the gesture back to the scroll.
      if (drag !== 0) setDrag(0);
      return;
    }
    if (!dragging) setDragging(true);
    setDrag(dy);
  }

  function onDragEnd() {
    dragFrom.current = null;
    setDragging(false);
    // A short tug springs back; past the threshold, or thrown, it closes.
    if (drag > DISMISS_PX) {
      onClose();
      // Left where it is rather than reset: the sheet is unmounting, and
      // snapping it home first would show it fly back up as it disappears.
      return;
    }
    setDrag(0);
  }

  // Reset between openings, so a sheet never reopens already half dragged off.
  useEffect(() => {
    if (!open) {
      setDrag(0);
      setDragging(false);
      dragFrom.current = null;
    }
  }, [open]);

  // Escape closes the sheet, matching CenterModal/FloatingMenu behavior.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 backdrop-blur-[6px]"
      onClick={onClose}
      /*
       * Stop the gesture here.
       *
       * This portals to <body>, so in the DOM it is outside everything. But
       * React dispatches events through the COMPONENT tree, and this sheet is
       * rendered by a feed card or a reel — so every touch inside it was also
       * delivered to their handlers. Two fingers in the comments pinched the
       * Shot underneath; a sideways drag changed tab. Blocking each offender
       * in turn is endless, because the leak is structural: anything that
       * renders a sheet inherits it. One stop at the portal root closes all
       * of them, including the ones nobody has written yet.
       */
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div
        ref={(el) => {
          trapRef.current = el;
          scrollRef.current = el;
        }}
        role="dialog"
        aria-modal="true"
        className="animate-rise w-full max-w-[480px] max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-elevated pb-[calc(var(--sab)+12px)]"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onDragStart}
        onTouchMove={onDragMove}
        onTouchEnd={onDragEnd}
        onTouchCancel={onDragEnd}
        style={{
          transform: drag ? `translateY(${drag}px)` : undefined,
          transition: dragging ? "none" : "transform 240ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-elevated/95 px-5 pb-2 pt-3 backdrop-blur-sm">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
          {title && (
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-white/5"
              >
                <X size={18} />
              </button>
            </div>
          )}
        </div>
        <div className="px-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
