"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { haptics } from "@/lib/haptics";
import { overlayCount } from "@/lib/overlay-stack";

/**
 * Swipe sideways to move between the bottom-nav tabs.
 *
 * Order matches the nav bar left to right. The centre "+" is missing on
 * purpose: it is an action, not a place, and swiping into a fullscreen camera
 * you did not ask for would be alarming.
 */
const TABS = ["/home", "/messages", "/shots", "/profile"] as const;

/** Fraction of the screen the finger must cross to commit to the next tab. */
const COMMIT_RATIO = 0.28;
/** A fast flick commits early — px per ms. */
const FLICK_VELOCITY = 0.45;
/** Below this the gesture is treated as a scroll and released to the page. */
const AXIS_LOCK_PX = 10;

/**
 * Which axis this gesture belongs to, or null while it is still ambiguous.
 *
 * Biased towards vertical on purpose: this sits over a scrolling feed, and
 * stealing a scroll is far more annoying than missing a swipe. A movement
 * has to be clearly more sideways than up-down before we claim it.
 */
export function lockAxis(
  ddx: number,
  ddy: number,
  threshold = AXIS_LOCK_PX
): null | "x" | "y" {
  if (Math.abs(ddx) < threshold && Math.abs(ddy) < threshold) return null;
  return Math.abs(ddx) > Math.abs(ddy) * 1.4 ? "x" : "y";
}

/** What a released horizontal drag should do. */
export function swipeOutcome(g: {
  dx: number;
  width: number;
  elapsed: number;
  canPrev: boolean;
  canNext: boolean;
}): "prev" | "next" | "stay" {
  const velocity = Math.abs(g.dx) / Math.max(1, g.elapsed);
  const far = Math.abs(g.dx) > g.width * COMMIT_RATIO;
  const flicked = velocity > FLICK_VELOCITY && Math.abs(g.dx) > 40;
  if (!far && !flicked) return "stay";
  if (g.dx < 0 && g.canNext) return "next";
  if (g.dx > 0 && g.canPrev) return "prev";
  return "stay";
}

function tabIndex(pathname: string): number {
  // Exact matches only. /messages/[thread] has its own swipe-to-reply, and
  // sub-routes are somewhere you navigated *into* — sliding out of them
  // sideways would be the wrong mental model.
  return (TABS as readonly string[]).indexOf(pathname);
}

/** Does this touch belong to something that scrolls sideways already? */
export function inHorizontalScroller(start: EventTarget | null): boolean {
  let el = start instanceof Element ? start : null;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    const scrolls =
      (style.overflowX === "auto" || style.overflowX === "scroll") &&
      el.scrollWidth > el.clientWidth + 4;
    if (scrolls) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Should this touch be released to whatever is under it?
 *
 * Split out from the handler so the rule is testable without a real gesture:
 * the DOM half needs a document, the overlay half is just a count.
 */
export function gestureBlocked(
  openOverlays: number,
  target: EventTarget | null
): boolean {
  if (openOverlays > 0) return true;
  return inHorizontalScroller(target);
}

export function SwipeNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const index = tabIndex(pathname);
  const enabled = index >= 0;

  const [dx, setDx] = useState(0);
  const [settling, setSettling] = useState(false);

  const start = useRef({ x: 0, y: 0, t: 0 });
  /** null = undecided, "x" = ours, "y" = the page's */
  const axis = useRef<null | "x" | "y">(null);
  const ignore = useRef(false);

  // A committed navigation leaves the old page mounted for a moment; clear the
  // offset when the route actually changes so the new one is not born shifted.
  useEffect(() => {
    setDx(0);
    setSettling(false);
  }, [pathname]);

  if (!enabled) return <>{children}</>;

  const canPrev = index > 0;
  const canNext = index < TABS.length - 1;

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    axis.current = null;
    // A sheet on top of the page means the page is not what is being
    // touched. Sheets portal to <body>, so they escape this element in the
    // DOM — but React routes events through the COMPONENT tree, and the
    // comments sheet is rendered by a feed card that lives inside here. So
    // every touch inside an open sheet still arrived, and dragging sideways
    // while reading comments changed tab out from under it.
    ignore.current = gestureBlocked(overlayCount(), e.target);
    setSettling(false);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (ignore.current || e.touches.length !== 1) return;
    // A sheet can open mid-drag — a long-press menu, say. Abandon the gesture
    // rather than sliding the page under whatever just appeared.
    if (overlayCount() > 0) {
      ignore.current = true;
      if (dx) {
        setSettling(true);
        setDx(0);
      }
      return;
    }
    const t = e.touches[0];
    const ddx = t.clientX - start.current.x;
    const ddy = t.clientY - start.current.y;

    if (axis.current === null) {
      const locked = lockAxis(ddx, ddy);
      if (!locked) return;
      axis.current = locked;
    }
    if (axis.current !== "x") return;

    // Resistance at the ends, so the first and last tabs feel like edges
    // rather than a broken gesture.
    const atEdge = (ddx > 0 && !canPrev) || (ddx < 0 && !canNext);
    setDx(atEdge ? ddx * 0.25 : ddx);
  }

  function onTouchEnd() {
    if (axis.current !== "x") {
      axis.current = null;
      return;
    }
    axis.current = null;

    const width = window.innerWidth || 1;
    const outcome = swipeOutcome({
      dx,
      width,
      elapsed: Date.now() - start.current.t,
      canPrev,
      canNext,
    });

    if (outcome !== "stay") {
      haptics.tap();
      setSettling(true);
      // Carry the page the rest of the way out before the route changes, so
      // the movement reads as continuous rather than as a jump cut.
      setDx(outcome === "next" ? -width : width);
      router.push(TABS[outcome === "next" ? index + 1 : index - 1]);
      return;
    }

    setSettling(true);
    setDx(0);
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => {
        axis.current = null;
        setSettling(true);
        setDx(0);
      }}
      // pan-y keeps vertical scrolling native and fast; only the horizontal
      // axis is ours to interpret.
      style={{
        touchAction: "pan-y",
        transform: dx ? `translate3d(${dx}px,0,0)` : undefined,
        transition: settling
          ? "transform 220ms cubic-bezier(0.16,1,0.3,1)"
          : undefined,
        willChange: dx ? "transform" : undefined,
      }}
    >
      {children}
    </div>
  );
}
