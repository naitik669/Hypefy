"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useOverlayBackButton } from "@/lib/overlay-stack";

/**
 * The sheet every overlay in this app arrives in, and a thing you hold.
 *
 * It used to appear: a 12px fade-in, a drag that only went down, only from
 * the very top of the content, and only ever ended in "gone". Nothing about
 * it answered the finger — you flicked and it vanished, or you flicked and it
 * did not, and there was no state in between to see.
 *
 * Now it is dragged. It follows the finger down, it follows it up into a
 * taller state when there is more to read, the backdrop lightens as it goes
 * so you can see what letting go would give you back, and it slides out
 * rather than blinking out. A hold can be taken back: anything short of the
 * threshold springs home.
 *
 * Every frame of the drag is written straight to the element's transform.
 * React state per touchmove is what made the old one feel like a slideshow —
 * and this component is rendered by 24 others, most of which re-render their
 * whole subtree.
 */

/**
 * How far down a sheet has to be taken before letting go sends it one step
 * down: expanded → resting → closed.
 *
 * A fraction of the screen rather than a fixed nudge, floored at half the
 * sheet's own height so a short menu is not asked for a drag longer than it
 * is tall. On a phone that is about a quarter of the screen: far enough that
 * the sheet cannot be lost to a flick while reading.
 */
const DISMISS_SCREEN = 0.25;
function dismissAt(sheetHeight: number): number {
  const screen = typeof window === "undefined" ? 800 : window.innerHeight;
  return Math.min(Math.max(sheetHeight * 0.5, 72), screen * DISMISS_SCREEN);
}
/** A throw beats the distance: px per ms. */
const FLING = 0.55;
/** Up this far and let go: it grows, if there is anything to grow for. */
const EXPAND_PX = 40;
/** How far it gives when pulled up with nowhere to go. */
const PEEK_PX = 48;
/** Time the sheet takes to settle, come in, or leave. */
const SETTLE_MS = 260;
const LEAVE_MS = 200;
const EASE = "cubic-bezier(0.16,1,0.3,1)";

/**
 * Whether a touch at `target` belongs to something between it and the sheet
 * body that scrolls vertically by itself (or opts out with data-sheet-no-drag).
 */
export function ownsVerticalDrag(target: Element | null, body: Element): boolean {
  for (let el = target; el && el !== body; el = el.parentElement) {
    if (el.hasAttribute("data-sheet-no-drag")) return true;
    if (el.scrollHeight > el.clientHeight + 1) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll") return true;
    }
  }
  return false;
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = "content",
  reportTop,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /**
   * "half" opens at half the screen and goes to the top; "tall" opens at 80%
   * for a sheet that is mostly the thing you came to pick from — the share
   * sheet's faces. See `heights`.
   */
  size?: "content" | "half" | "tall";
  /**
   * Something that belongs at the bottom of the sheet rather than at the
   * bottom of its contents — a composer, a confirm bar.
   *
   * It is a sibling of the scrolling part, not `position: sticky` inside it.
   * Sticky is bounded by its container's content box, so the scroller's own
   * bottom padding held the composer a safe-area's height off the floor and
   * the thread scrolled through the gap underneath it. A row you type into
   * should not have anything moving behind it.
   */
  footer?: React.ReactNode;
  /**
   * A CSS custom property to keep pointed at this sheet's top edge, in pixels
   * from the top of the viewport, for as long as it is open.
   *
   * It is how something behind the sheet makes room for it — the Shots viewer
   * shrinks the video into whatever is left. Written straight to the document
   * alongside the transform, never through React: this updates on every frame
   * of a drag, and a state write per touchmove is exactly what this component
   * exists to avoid.
   *
   * Opt-in, and one sheet at a time. Sheets stack — a GIF picker over
   * comments — and two of them writing the same property would fight.
   */
  reportTop?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

/**
   * Whether the sheet is on screen, which outlives `open` by the length of
   * the exit.
   *
   * `open` going false used to unmount it on the spot, so it left by
   * disappearing — including when you had just dragged it halfway down, which
   * is the moment the movement should carry on rather than cut. It cannot be
   * turned on from an effect either: the render that saw `open` go true would
   * have already returned null, and the effect would then mount a brand new
   * element with no entrance to play. So it is adjusted during the render
   * that learns about the prop, which is what React documents this for.
   */
  const [showing, setShowing] = useState(open);
  if (open && !showing) setShowing(true);

  /** Taller than it rests, because it was pulled up. */
  const [expanded, setExpanded] = useState(false);

  /**
   * The screen, watched.
   *
   * A half sheet is sized in pixels rather than dvh once it is up, because
   * the drag works in pixels and the two have to agree to the pixel — a
   * height React thinks is "50dvh" and a height the finger left at 406px are
   * the same number until something re-renders. Re-read when the screen
   * changes, which is a rotation or the keyboard.
   */
  const [screenH, setScreenH] = useState<number | null>(null);
  useEffect(() => {
    const read = () => setScreenH(window.innerHeight);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  /**
   * The two heights a sheet rests at.
   *
   * "content" is the default: as tall as what is in it, up to 85% of the
   * screen. "half" is for a sheet you read in — comments — which opens at
   * half the screen whatever is in it, and goes to the top when pulled up.
   * A thread that opened at the height of its three comments, and again at
   * the height of its thirty, is a different surface every time you tap.
   */
  const rest = size === "tall" ? 0.8 : 0.5;
  const detents = size !== "content";
  const heights = detents
    ? {
        height:
          screenH == null
            ? expanded
              ? "94dvh"
              : `${rest * 100}dvh`
            : `${screenH * (expanded ? 0.94 : rest)}px`,
      }
    : { maxHeight: expanded ? "95dvh" : "85dvh" };

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const veilRef = useRef<HTMLDivElement | null>(null);
  /**
   * The sheet's own height, kept fresh by an observer rather than measured
   * inside place(). Reading offsetHeight there would force a layout on every
   * frame of the drag, which is the one thing this component exists to avoid.
   */
  const sheetH = useRef(0);
  /** Read inside place(), which must not be rebuilt when the prop changes. */
  const reportRef = useRef(reportTop);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /** The same two heights, in pixels, for a drag to work against. */
  const stops = useCallback(() => {
    const screen =
      screenH ?? (typeof window === "undefined" ? 800 : window.innerHeight);
    return { rest: screen * rest, top: screen * 0.94 };
  }, [screenH, rest]);

  /**
   * Watch the sheet's own height so place() never has to measure, and take
   * the property away again on the way out — otherwise whatever was making
   * room for the sheet keeps making room for a sheet that has gone.
   */
  useEffect(() => {
    const el = sheetRef.current;
    reportRef.current = reportTop;
    if (!showing || !el) return;

    // place() owns the drag, but not the way in: the entrance animation sets
    // the transform itself, in two steps, and routing it through place()
    // would disturb a sequence that is doing something careful. So resting is
    // marked here and dragging is marked there.
    const mark = () => {
      sheetH.current = el.offsetHeight;
      if (!reportTop) return;
      document.documentElement.style.setProperty(
        reportTop,
        `${Math.max(0, Math.round(window.innerHeight - sheetH.current))}px`,
      );
    };
    mark();

    // The height changes when the sheet is pulled up to its taller stop, and
    // the viewport changes when the keyboard arrives. Optional on purpose:
    // an old WebView without ResizeObserver still gets the resting mark and
    // everything place() writes, which is the whole of the drag.
    const ro =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(mark);
    ro?.observe(el);
    window.addEventListener("resize", mark);

    const prop = reportTop;
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", mark);
      // Whatever was making room must stop making room for a sheet that has
      // gone, or the video never comes back.
      if (prop) document.documentElement.style.removeProperty(prop);
    };
  }, [showing, reportTop, expanded]);

  const trapRef = useFocusTrap<HTMLDivElement>(mounted && open);

  // Android hardware back closes the sheet before it navigates.
  useOverlayBackButton(mounted && open, onClose);

  /* --- Moving it ---------------------------------------------------------- */
  /** Where the sheet is, in pixels from where it rests. */
  const place = useCallback((y: number, ms = 0) => {
    const el = sheetRef.current;
    if (el) {
      el.style.transition = ms ? `transform ${ms}ms ${EASE}` : "none";
      el.style.transform = y ? `translate3d(0,${y}px,0)` : "translate3d(0,0,0)";
      // Every move of this sheet goes through here — the drag, the settle,
      // the way in and the way out — so this is the one place that can tell
      // whatever is behind it where the top edge now is.
      if (reportRef.current && sheetH.current) {
        document.documentElement.style.setProperty(
          reportRef.current,
          `${Math.max(0, Math.round(window.innerHeight - sheetH.current + y))}px`,
        );
      }
    }
    // The backdrop is deliberately NOT tied to the drag. Fading it by the
    // pixel made the whole screen flicker as the sheet moved, and a surface
    // whose brightness wobbles under your thumb reads as cheap. It fades once
    // on the way in and once on the way out.
  }, []);

  const drag = useRef({
    active: false,
    startY: 0,
    startT: 0,
    /** Where the sheet is drawn: damped when pulled up. */
    dy: 0,
    /** How far the finger actually travelled, which is what decides. */
    raw: 0,
    /** The height a half sheet has been dragged to. */
    h: 0,
    /** Started on the handle, which can be dragged whatever the scroll is at. */
    handle: false,
  });

  /** Is there anywhere taller to go? */
  const canGrow = useCallback(() => {
    // A half sheet always has the top to go to, whether or not the thread in
    // it is long enough to scroll.
    if (detents) return true;
    const body = scrollRef.current;
    return !!body && body.scrollHeight > body.clientHeight + 8;
  }, [size]);

  const begin = useCallback((y: number, handle: boolean) => {
    drag.current = { active: true, startY: y, startT: Date.now(), dy: 0, raw: 0, h: 0, handle };
  }, []);

  const moveTo = useCallback(
    (y: number) => {
      const d = drag.current;
      if (!d.active) return;
      const raw = y - d.startY;
      d.raw = raw;

      if (detents) {
        // The top edge follows the finger: the sheet GROWS on the way up and
        // shrinks on the way down, rather than sliding as one piece. It used
        // to rubber-band 48px and then refuse to move, which is what made a
        // pull upwards feel stuck — the finger kept going and the sheet did
        // not. Only below its resting height does it start to slide, which
        // is the movement that means "away".
        const { rest, top } = stops();
        const want = (expanded ? top : rest) - raw;
        const el = sheetRef.current;
        d.h = Math.min(Math.max(want, rest), top);
        d.dy = Math.max(0, rest - want);
        if (el) {
          el.style.transition = "none";
          el.style.height = `${d.h}px`;
        }
        place(d.dy);
        return;
      }

      // Up: a sheet that is only as tall as its contents has nowhere to grow
      // to, so the pull is resisted and springs back.
      const dy =
        raw < 0
          ? Math.max(raw * (canGrow() && !expanded ? 0.55 : 0.2), -PEEK_PX)
          : raw;
      d.dy = dy;
      place(dy);
    },
    [canGrow, expanded, place, size, stops],
  );

  const end = useCallback(() => {
    const d = drag.current;
    if (!d.active) return;
    // The finger's own distance, not the damped one it was drawn at: pulling
    // up is deliberately resisted, and measuring the resistance would make
    // the sheet need a much longer pull than it looks like it needs.
    const { raw } = d;
    d.active = false;
    const speed = Math.abs(raw) / Math.max(1, Date.now() - d.startT);
    const flung = speed > FLING && Math.abs(raw) > 40;
    const ms = reducedMotion() ? 0 : SETTLE_MS;
    const far = dismissAt(sheetRef.current?.offsetHeight ?? 0);

    if (detents) {
      const { rest, top } = stops();
      const el = sheetRef.current;
      // Below its resting height it is on its way out.
      if (d.dy > 0 && (d.dy > far || (flung && d.dy > 40))) {
        onClose();
        return;
      }
      // A flick is an instruction, whatever distance it covered: up goes to
      // the top, down goes one step down. Anything slower is a choice
      // between the two heights, settled by whichever it is nearer — so the
      // sheet ends where the finger left it, near enough.
      const grew = flung
        ? raw < 0
        : (d.h || rest) > (rest + top) / 2;
      if (flung && raw > 0 && !expanded) {
        onClose();
        return;
      }
      setExpanded(grew);
      if (el) {
        el.style.transition = ms
          ? `height ${ms}ms ${EASE}, transform ${ms}ms ${EASE}`
          : "none";
        // The same number React renders for this state, so the two cannot
        // disagree — and nothing is cleared afterwards: clearing a style
        // React owns leaves it with nothing to re-apply, which dropped the
        // sheet to the height of its own contents.
        el.style.height = `${grew ? top : rest}px`;
        el.style.transform = "translate3d(0,0,0)";
        // Settling here does not go through place(), and when the sheet
        // springs back to the same height nothing resizes either — so
        // without this the property keeps the last value the drag wrote and
        // whatever was making room stays the wrong size. Taken from the
        // height being settled to, not from a measurement, because that
        // height is still animating.
        if (reportRef.current) {
          document.documentElement.style.setProperty(
            reportRef.current,
            `${Math.max(0, Math.round(window.innerHeight - (grew ? top : rest)))}px`,
          );
        }
      }
      return;
    }

    if (raw > 0 && (raw > far || flung)) {
      // One step down per drag: a tall sheet comes back to its resting
      // height first, so the thing you were reading is not lost to a gesture
      // that only meant "smaller".
      if (expanded && !(flung && raw > far * 2)) {
        setExpanded(false);
        place(0, ms);
        return;
      }
      onClose();
      return;
    }

    if (raw < 0 && (raw < -EXPAND_PX || flung) && canGrow() && !expanded) {
      setExpanded(true);
    }
    place(0, ms);
  }, [canGrow, expanded, onClose, place, size, stops]);

  /* --- Where a drag may start --------------------------------------------- */
  /** A body touch waiting to find out which way it is going. */
  const pending = useRef<{ y: number; atTop: boolean; atBottom: boolean } | null>(null);

  const handleTouch = {
    onTouchStart: (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      begin(e.touches[0].clientY, true);
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      moveTo(e.touches[0].clientY);
    },
    onTouchEnd: end,
    onTouchCancel: end,
  };

  const bodyTouch = {
    onTouchStart: (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      // Read the scroll at touch-down, not mid-move: by the time a finger has
      // travelled the body may have reached the top on its own, and the
      // gesture would turn into a dismiss in the middle of a scroll.
      const b = scrollRef.current;
      // A drum or list inside the sheet that scrolls on its own owns its
      // vertical drags: the date wheel sits in a body with nothing to scroll,
      // so without this every turn of a wheel dragged the whole sheet.
      if (b && ownsVerticalDrag(e.target as Element, b)) return;
      const atTop = (b?.scrollTop ?? 0) <= 0;
      const atBottom = !!b && b.scrollTop + b.clientHeight >= b.scrollHeight - 1;
      // From the top, a pull down is the sheet. From the bottom — or when
      // there is nothing to scroll — a pull up is the sheet growing. Nothing
      // is claimed yet: which way the finger goes decides, in the move.
      if (!atTop && !atBottom) return;
      pending.current = { y: e.touches[0].clientY, atTop, atBottom };
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      const p = pending.current;
      if (p) {
        const raw = e.touches[0].clientY - p.y;
        if (Math.abs(raw) < 6) return;
        const down = raw > 0;
        // Claim it only in the direction the scroll cannot use.
        if ((down && !p.atTop) || (!down && !p.atBottom)) {
          pending.current = null;
          return;
        }
        pending.current = null;
        begin(p.y, false);
      }
      moveTo(e.touches[0].clientY);
    },
    onTouchEnd: () => {
      pending.current = null;
      end();
    },
    onTouchCancel: () => {
      pending.current = null;
      end();
    },
  };

  /* --- Coming and going ---------------------------------------------------- */
  // In from below, rather than a 12px fade that read as "appeared".
  useEffect(() => {
    if (!open || !mounted) return;
    const el = sheetRef.current;
    const veil = veilRef.current;
    if (!el) return;
    if (reducedMotion()) {
      place(0);
      if (veil) veil.style.opacity = "1";
      return;
    }
    el.style.transition = "none";
    el.style.transform = "translate3d(0,100%,0)";
    if (veil) {
      veil.style.transition = "none";
      veil.style.opacity = "0";
    }
    void el.offsetHeight; // lay the start out before moving from it
    el.style.transition = `transform ${SETTLE_MS}ms ${EASE}`;
    el.style.transform = "translate3d(0,0,0)";
    if (veil) {
      veil.style.transition = `opacity ${SETTLE_MS}ms ease-out`;
      veil.style.opacity = "1";
    }
  }, [open, mounted, place]);

  // Out through the bottom, carrying on from wherever the drag left it.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;

    const slow = !reducedMotion();
    if (slow) {
      const el = sheetRef.current;
      if (el) {
        el.style.transition = `transform ${LEAVE_MS}ms ease-in`;
        el.style.transform = "translate3d(0,100%,0)";
      }
      const veil = veilRef.current;
      if (veil) {
        veil.style.transition = `opacity ${LEAVE_MS}ms ease-in`;
        veil.style.opacity = "0";
      }
    }
    const t = setTimeout(() => {
      setShowing(false);
      setExpanded(false);
    }, slow ? LEAVE_MS : 0);
    return () => clearTimeout(t);
  }, [open]);

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

  // Escape closes the sheet, matching CenterModal/FloatingMenu behavior.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !showing) return null;

  return createPortal(
    <div
      ref={veilRef}
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
          sheetRef.current = el;
        }}
        role="dialog"
        aria-modal="true"
        data-sheet=""
        data-expanded={expanded ? "" : undefined}
        className="flex w-full max-w-[480px] flex-col rounded-t-3xl border-t border-border bg-elevated"
        style={heights}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The grab handle, and the title if there is one. Draggable whatever
            the content below is scrolled to — the one part of a sheet you can
            always take hold of. */}
        <div
          data-sheet-handle=""
          className="shrink-0 px-5 pb-2 pt-3"
          style={{ touchAction: "none" }}
          {...handleTouch}
        >
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

        <div
          ref={scrollRef}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 ${
            // With a footer below it, the floor — and the phone's own bottom
            // inset — belong to the footer.
            footer ? "pb-2" : "pb-[calc(var(--sab)+12px)]"
          }`}
          {...bodyTouch}
        >
          {children}
        </div>

        {footer && (
          <div
            data-sheet-footer=""
            className="shrink-0 border-t border-border bg-elevated px-5 pb-[calc(var(--sab)+10px)] pt-2"
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
