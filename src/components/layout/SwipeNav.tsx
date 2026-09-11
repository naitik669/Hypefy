"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { haptics } from "@/lib/haptics";
import { overlayCount } from "@/lib/overlay-stack";

/**
 * Swipe sideways to move between the bottom-nav tabs.
 *
 * Order matches the nav bar left to right. The centre "+" is missing on
 * purpose: it is an action, not a place, and swiping into a fullscreen camera
 * you did not ask for would be alarming.
 *
 * /discover is the exception — it has no tab, but it sits to the LEFT of home
 * so that swiping right from the feed reaches it. Home was the left end of the
 * list, so that gesture did nothing at all, and Discover was reachable only
 * through the compass in the top bar.
 */
const TABS = ["/discover", "/home", "/messages", "/shots", "/profile"] as const;

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
  // Exact matches only. A sub-route is somewhere you navigated INTO, so
  // sliding out of it sideways is the wrong mental model — you would expect
  // back, not a tab change.
  //
  // An earlier version of this comment claimed /messages/[thread] had its own
  // swipe-to-reply and that this was avoiding a clash. It does not; there are
  // no touch handlers in RealChatView at all. The exclusion is right, the
  // stated reason was not.
  return (TABS as readonly string[]).indexOf(pathname);
}

/**
 * Marks an element whose own sideways drags must never become navigation.
 *
 * Needed because the check below can only see NATIVE scrollers, and the post
 * gallery is not one: it is `overflow-hidden` with a JS-driven transform, so
 * it has no overflowX and no scrollWidth to notice. Swiping between a post's
 * photos was therefore read as a tab swipe, and you landed in Messages.
 */
export const HSWIPE_ATTR = "data-hswipe";

/** Does this touch belong to something that handles sideways drags itself? */
export function inHorizontalScroller(start: EventTarget | null): boolean {
  let el = start instanceof Element ? start : null;
  while (el && el !== document.body) {
    // Explicit opt-out first: a JS carousel says so, since nothing about its
    // computed style gives it away.
    if (el.hasAttribute(HSWIPE_ATTR)) return true;
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

/** What the destination is called, shown in the gap the finger opens. */
const TAB_LABELS: Record<(typeof TABS)[number], string> = {
  "/discover": "Discover",
  "/home": "Home",
  "/messages": "Messages",
  "/shots": "Shots",
  "/profile": "Profile",
};

const SETTLE = "transform 260ms cubic-bezier(0.16,1,0.3,1), opacity 260ms ease";

/**
 * The page follows the finger sideways, and the gap it opens names where you
 * are going — "Messages ›" — rather than showing bare black. Let go past the
 * line and the page carries on out while the next one slides in from the
 * same side, as one movement; let go short of it and it springs back.
 *
 * Every frame of the drag is written straight to the page's transform. The
 * old version set React state on each touchmove, which re-rendered this
 * wrapper for every pixel of the gesture.
 */
export function SwipeNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const index = tabIndex(pathname);
  const enabled = index >= 0;

  const page = useRef<HTMLDivElement>(null);
  const hintEl = useRef<HTMLDivElement>(null);
  /** Where the finger is heading, once the gesture is ours. */
  const [hint, setHint] = useState<{ label: string; side: "left" | "right" } | null>(null);

  const start = useRef({ x: 0, y: 0, t: 0 });
  /** null = undecided, "x" = ours, "y" = the page's */
  const axis = useRef<null | "x" | "y">(null);
  const ignore = useRef(false);
  const dx = useRef(0);
  /** Set while a committed swipe waits for its page: which way it went. */
  const leaving = useRef<-1 | 1 | 0>(0);

  const canPrev = index > 0;
  const canNext = index >= 0 && index < TABS.length - 1;

  function paint(x: number, transition = "none") {
    const el = page.current;
    if (el) {
      el.style.transition = transition;
      el.style.transform = x ? `translate3d(${x}px,0,0)` : "";
    }
    const h = hintEl.current;
    if (h) {
      // Grows into view as the gap opens.
      const w = window.innerWidth || 1;
      const k = Math.min(1, Math.abs(x) / (w * COMMIT_RATIO));
      h.style.transition = transition;
      h.style.width = `${Math.abs(x)}px`;
      h.style.opacity = String(k);
      h.firstElementChild?.setAttribute("style", `transform: scale(${0.8 + 0.2 * k})`);
    }
  }

  // The new page arrives: if a swipe brought us here, slide it in from the
  // side the finger was pulling from. Before paint, so it never flashes in
  // the middle first.
  useLayoutEffect(() => {
    const dir = leaving.current;
    leaving.current = 0;
    const el = page.current;
    if (!el) return;
    if (!dir) {
      paint(0);
      return;
    }
    const w = window.innerWidth || 1;
    el.style.transition = "none";
    el.style.transform = `translate3d(${-dir * w * 0.35}px,0,0)`;
    el.style.opacity = "0.4";
    void el.offsetWidth; // lay the start out before moving from it
    el.style.transition = SETTLE;
    el.style.transform = "";
    el.style.opacity = "";
  }, [pathname]);

  if (!enabled) return <>{children}</>;

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    axis.current = null;
    dx.current = 0;
    // A sheet on top of the page means the page is not what is being
    // touched. Sheets portal to <body>, so they escape this element in the
    // DOM — but React routes events through the COMPONENT tree, and the
    // comments sheet is rendered by a feed card that lives inside here. So
    // every touch inside an open sheet still arrived, and dragging sideways
    // while reading comments changed tab out from under it.
    ignore.current = gestureBlocked(overlayCount(), e.target);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (ignore.current || e.touches.length !== 1) return;
    // A sheet can open mid-drag — a long-press menu, say. Abandon the gesture
    // rather than sliding the page under whatever just appeared.
    if (overlayCount() > 0) {
      ignore.current = true;
      if (dx.current) paint(0, SETTLE);
      dx.current = 0;
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
    const toNext = ddx < 0;
    const atEdge = (ddx > 0 && !canPrev) || (toNext && !canNext);
    const x = atEdge ? ddx * 0.25 : ddx;
    // Name the destination once per direction, not per frame.
    const dest = atEdge ? null : TABS[toNext ? index + 1 : index - 1];
    const want = dest ? { label: TAB_LABELS[dest], side: toNext ? ("right" as const) : ("left" as const) } : null;
    if (want?.label !== hint?.label || want?.side !== hint?.side) setHint(want);
    dx.current = x;
    paint(x);
  }

  function onTouchEnd() {
    if (axis.current !== "x") {
      axis.current = null;
      return;
    }
    axis.current = null;

    const width = window.innerWidth || 1;
    const outcome = swipeOutcome({
      dx: dx.current,
      width,
      elapsed: Date.now() - start.current.t,
      canPrev,
      canNext,
    });

    if (outcome !== "stay") {
      haptics.tap();
      const dir = outcome === "next" ? 1 : -1;
      leaving.current = dir;
      // Carry the page the rest of the way out while the next one loads; it
      // arrives from the same side (see the layout effect above).
      paint(-dir * width, SETTLE);
      router.push(TABS[index + dir]);
      return;
    }

    dx.current = 0;
    paint(0, SETTLE);
  }

  return (
    <>
      {/* The gap the page leaves as it moves: where you are going. */}
      <div
        ref={hintEl}
        aria-hidden
        className="pointer-events-none fixed bottom-0 top-0 z-0 flex items-center justify-center"
        style={{ [hint?.side === "left" ? "left" : "right"]: 0, width: 0, opacity: 0 }}
      >
        {hint && (
          <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/[0.07] px-3.5 py-2 text-sm font-bold text-foreground/85">
            {hint.side === "left" && <span aria-hidden>‹</span>}
            {hint.label}
            {hint.side === "right" && <span aria-hidden>›</span>}
          </span>
        )}
      </div>
      <div
        ref={page}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          axis.current = null;
          dx.current = 0;
          paint(0, SETTLE);
        }}
        // pan-y keeps vertical scrolling native and fast; only the horizontal
        // axis is ours to interpret. Positioned, and after the hint, so it
        // paints over it — but deliberately WITHOUT a z-index: that would
        // make it a stacking context, and every full-screen menu and viewer
        // drawn inside a page (not portalled) would sink under the bottom nav.
        className="relative bg-background"
        style={{ touchAction: "pan-y" }}
      >
        {children}
      </div>
    </>
  );
}
