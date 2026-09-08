"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { haptics } from "@/lib/haptics";

/** Hold before the stack appears. Matches AccountSwitchPad. */
const HOLD_MS = 320;
/** Movement that cancels the hold — treat it as a scroll, not a press. */
const CANCEL_SLOP_PX = 10;

export type HoldAction = {
  icon: LucideIcon;
  label: string;
  href: string;
};

/**
 * Hold a nav tab to raise a stack of shortcuts, slide the thumb to one, let go.
 *
 * The same gesture as AccountSwitchPad, deliberately: one hold-and-slide idiom
 * across the nav bar rather than two that behave almost alike. Purpose-built
 * rather than extracted from it, because that component's bulk is the account
 * list — a scrolling window over an unbounded set, session switching, a
 * full-screen switch overlay — and none of it applies to four fixed links.
 * Sharing the mechanics would have meant a 500-line refactor of a working
 * interaction to save about eighty lines here.
 *
 * The parts that matter, all learned from that component:
 *
 *  - The trigger captures the pointer on long-press, so pointermove keeps
 *    arriving after the thumb leaves a 48px target — which it does immediately.
 *  - Hit-testing is against measured rects on the Y axis alone. A finger
 *    produces no hover, and thumbs arc sideways as they reach up, so demanding
 *    X containment breaks the top of the stack for the longest reaches.
 *  - A plain tap falls through untouched: if the hold never completes, the
 *    click reaches the link underneath as normal.
 */
export function NavHoldMenu({
  actions,
  label,
  children,
}: {
  actions: HoldAction[];
  /** Names the stack for assistive tech, e.g. "Home shortcuts". */
  label: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  /** Pointer was taken away mid-gesture; the stack stays up and is tapped. */
  const [detached, setDetached] = useState(false);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startY = useRef(0);
  const startX = useRef(0);
  /** Set once the hold completes, so the trailing click is swallowed. */
  const didHold = useRef(false);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);

  // Bottom-of-column is nearest the thumb, so the visual order is the
  // reverse of the caller's priority order. Everything below — hit-testing,
  // the stagger, commit — indexes into THIS list, so they cannot disagree.
  const ordered = [...actions].reverse();

  const close = useCallback(() => {
    setOpen(false);
    setActiveIdx(null);
    setDetached(false);
  }, []);

  const clearHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  useEffect(() => clearHold, [clearHold]);

  // Escape and the Android back button both dismiss before doing anything else.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  /**
   * Which row is under this Y position, or null.
   *
   * Reads the rendered rows straight out of the stack rather than an array
   * kept in sync by ref callbacks. The ref version silently held nothing —
   * every hit-test missed, so sliding highlighted nothing and releasing
   * committed nothing, which is exactly what "can't choose options" looked
   * like. Whatever the cause (inline ref callbacks are re-created and
   * re-invoked on every render, and this list re-renders on every move), the
   * DOM is the thing being pointed at, so asking it directly cannot drift.
   */
  function rowAt(y: number): number | null {
    const stack = stackRef.current;
    if (!stack) return null;
    const els = stack.querySelectorAll<HTMLElement>('[role="option"]');
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) return i;
    }
    return null;
  }

  /** Close, and act on the row the thumb was resting on. null just closes. */
  function commit(idx: number | null) {
    close();
    if (idx === null) return;
    haptics.tap();
    router.push(ordered[idx].href);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    didHold.current = false;
    startY.current = e.clientY;
    startX.current = e.clientX;
    const pid = e.pointerId;

    clearHold();
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      didHold.current = true;
      setOpen(true);
      setActiveIdx(null);
      haptics.select();
      // Keep receiving moves after the thumb leaves the small tab.
      try {
        triggerRef.current?.setPointerCapture(pid);
      } catch {
        /* capture unsupported — the gesture still works over the tab */
      }
    }, HOLD_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!open) {
      const moved =
        Math.abs(e.clientY - startY.current) > CANCEL_SLOP_PX ||
        Math.abs(e.clientX - startX.current) > CANCEL_SLOP_PX;
      if (moved) clearHold();
      return;
    }
    const hit = rowAt(e.clientY);
    if (hit !== activeIdx) {
      setActiveIdx(hit);
      if (hit !== null) haptics.select();
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    clearHold();
    try {
      triggerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* never captured */
    }
    if (!open) return;
    // The pointer was already taken away — the stack is being tapped now,
    // so a stray release must not commit or dismiss it.
    if (detached) return;

    // Commits on the row the MOVE handler last landed on, not a fresh
    // hit-test of the release coordinates. After a capture those can be
    // stale or outside every row, which is how a deliberate pick ended up
    // committing nothing.
    commit(activeIdx);
  }
  return (
    <div className="relative flex items-center justify-center">
      {open && (
        <>
          {/* Portalled because the nav carries backdrop-blur, which makes it
              the containing block for fixed children — rendered in place this
              dimmed the tab bar and nothing else.

              z-25 puts it UNDER the nav (z-30). The tiles live inside the nav,
              and the nav is its own stacking context, so their z-50 is capped
              at 30 against the root: a veil at z-40 sits ON TOP of them and
              blurs the very options being chosen. AccountSwitchPad documents
              this exact trap and I walked into it anyway — hence the identical
              value here rather than a fresh guess. */}
          {typeof document !== "undefined" &&
            createPortal(
              <div
                className="animate-switch-veil fixed inset-0 z-[25] bg-black/55 backdrop-blur-[2px]"
                aria-hidden
                onPointerDown={detached ? close : undefined}
              />,
              document.body,
            )}

          <div
            ref={stackRef}
            className="absolute bottom-[calc(100%+14px)] left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-3"
            role="listbox"
            aria-label={label}
          >
            {/* Rendered in REVERSE, matching AccountSwitchPad: the stack grows
                upward from a tab on the bottom edge, so "first" has to mean
                "nearest the thumb", which is the bottom of the column. Left in
                source order, actions[0] landed furthest away — the longest
                reach for the item that most deserves the shortest. */}
            {ordered.map((action, i) => {
              const active = i === activeIdx;
              const Icon = action.icon;
              return (
                <div
                  key={action.href}
                  role="option"
                  aria-selected={active}
                  onPointerEnter={detached ? () => setActiveIdx(i) : undefined}
                  onPointerDown={
                    detached
                      ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          close();
                          router.push(action.href);
                        }
                      : undefined
                  }
                  className="relative flex items-center justify-end"
                  style={{
                    // Stagger outwards from the thumb, so the stack unfurls
                    // away from the finger rather than at it.
                    animation: `switch-rise 260ms cubic-bezier(0.16,1,0.3,1) ${
                      (actions.length - 1 - i) * 38
                    }ms backwards`,
                  }}
                >
                  {/* Label slides out from behind the tile, right to left, and
                      only for the row under the thumb. Clipped rather than
                      faded: this wrapper's right edge meets the tile's left
                      edge, so a parked label is invisible without ever being
                      transparent. Padding on three sides gives the shadow room
                      — overflow clips at the padding box, so only the
                      un-padded right edge cuts. */}
                  <span className="pointer-events-none absolute right-full overflow-hidden py-2 pl-3">
                    <span
                      className="block max-w-[42vw] truncate whitespace-nowrap rounded-lg bg-background/90 px-2.5 py-1 text-[13px] font-bold text-foreground shadow-lg ring-1 ring-border/70"
                      style={{
                        transform: active
                          ? "translate3d(0,0,0)"
                          : "translate3d(calc(100% + 10px), 0, 0)",
                        marginRight: 10,
                        transition: "transform 260ms cubic-bezier(0.16,1,0.3,1)",
                      }}
                    >
                      {action.label}
                    </span>
                  </span>

                  <div
                    className={`transition-transform duration-200 ease-out ${
                      active ? "-translate-x-2.5 scale-110" : "scale-100"
                    }`}
                  >
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-[16px] border-2 transition-colors duration-200 ${
                        active
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border bg-surface/95 text-foreground"
                      }`}
                    >
                      <Icon size={21} aria-hidden />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div
        ref={triggerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          clearHold();
          // Deliberately does NOT close. Some WebViews cancel the pointer even
          // with touch-action: none, and dropping the stack here is what makes
          // it flash up and vanish. Fall back to tap-to-choose.
          if (open) {
            setDetached(true);
            setActiveIdx(null);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={(e) => {
          // The hold ends in a click. Let it through only for a real tap.
          if (didHold.current) {
            e.preventDefault();
            e.stopPropagation();
            didHold.current = false;
          }
        }}
        // The single most important line here, and the one this component
        // shipped without. touch-action is read at TOUCHSTART, so it cannot be
        // switched on once the hold completes — by then the browser has
        // reserved the gesture for panning and cancels the pointer the moment
        // the thumb moves. That is why releasing did not close the menu (no
        // pointerup ever arrived) and why sliding could not pick anything (no
        // pointermove either). It has to be "none" from the first contact.
        // A long-press on a link or image also raises the WebView's own
        // callout, which cancels the pointer too; hence the rest.
        style={{
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
        className={`relative z-50 transition-transform duration-200 ${
          open ? "scale-95" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}
