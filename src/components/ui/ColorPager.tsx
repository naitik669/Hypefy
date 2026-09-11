"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SquircleSwatch } from "@/components/ui/SquircleSwatch";

export type PagerGroup = {
  key: string;
  label: string;
  colors: { key: string; label: string; background: string }[];
};

/** How far to drag, as a share of the line, before letting go moves it on. */
const THRESHOLD = 0.18;
/** Or a flick this fast, px/ms, however short. */
const FLICK = 0.35;
/** Movement before a press is read as a swipe, not a tap. */
const SLOP = 8;
const SETTLE = "transform 360ms cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Colours a line at a time: one family fills the line, and a swipe brings
 * the next family's whole line in. Dots under it say how many lines there
 * are and which you are on; tapping one goes there. It opens on the line
 * holding the colour already chosen.
 *
 * The swipe is its own, not the browser's scroll-snap. With scroll-snap a
 * hard flick carried on through every line to the last one — the snap
 * points are only suggestions to a fling, and phones ignore "stop at each".
 * Here a swipe is exactly one line, whatever its speed: the line follows the
 * finger, and on release it settles on the next line or springs back. It
 * drags stiffly past the first and last line, so the ends are felt. Only
 * sideways drags are taken; an up-or-down one is left to scroll the page.
 *
 * Touches stop here too: this sits inside cards and sheets that have swipes
 * of their own, and a swipe through colours must not also move those.
 */
export function ColorPager({
  groups,
  value,
  onChange,
  size = 34,
  label = "Colour",
}: {
  groups: PagerGroup[];
  value: string;
  onChange: (key: string) => void;
  /** The most a swatch grows to; they shrink to fit a narrow line. */
  size?: number;
  label?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(() => Math.max(0, groups.findIndex((g) => g.colors.some((c) => c.key === value))));
  const last = groups.length - 1;
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    dx: number;
    /** Undecided until it moves; then a swipe (ours) or a scroll (the page's). */
    mode: "wait" | "swipe" | "scroll";
    lastX: number;
    lastT: number;
    v: number;
  } | null>(null);
  /** A swipe just ended: the click it leaves behind must not pick a colour. */
  const swiped = useRef(false);
  const first = useRef(true);
  const wheelAt = useRef(0);
  // Where it opens, as a style that never changes, so the first paint is
  // already on the right line. Every move after that is set by place().
  const [opening] = useState(() => `translate3d(${-page * 100}%, 0, 0)`);

  /** Put the strip on `page`, `dx` px along; animated unless following a finger. */
  function place(p: number, dx: number, animate: boolean) {
    const el = strip.current;
    if (!el) return;
    el.style.transition = animate ? SETTLE : "none";
    el.style.transform = `translate3d(calc(${-p * 100}% + ${dx}px), 0, 0)`;
  }

  // Once a drag is ours, the browser gets none of it. Left to itself it read
  // a flick as the start of a fling, and the next tap — picking a colour on
  // the line just arrived — only stopped that fling, so nothing was chosen
  // for a second or two after every swipe. Only a non-passive touchmove can
  // refuse a gesture already under way.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const own = (e: TouchEvent) => {
      if (drag.current?.mode === "swipe" && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", own, { passive: false });
    return () => el.removeEventListener("touchmove", own);
  }, []);

  // Settle on the page whenever it changes — straight there the first time.
  useLayoutEffect(() => {
    place(page, 0, !first.current);
    first.current = false;
  }, [page]);

  function go(p: number) {
    const next = Math.min(last, Math.max(0, p));
    if (next === page) place(page, 0, true);
    else setPage(next);
  }

  function onPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swiped.current = false;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, mode: "wait", lastX: e.clientX, lastT: e.timeStamp, v: 0 };
  }

  function onPointerMove(e: React.PointerEvent) {
    e.stopPropagation();
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.mode === "wait") {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        d.mode = "scroll";
        return;
      }
      d.mode = "swipe";
      try {
        track.current?.setPointerCapture(e.pointerId);
      } catch {
        /* still works while the finger stays on the line */
      }
    }
    if (d.mode !== "swipe") return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    // Stiff past the ends, so there is nothing there to drag to.
    const edge = (page === 0 && dx > 0) || (page === last && dx < 0);
    d.dx = edge ? dx / 3 : dx;
    place(page, d.dx, false);
  }

  function onPointerUp(e: React.PointerEvent) {
    e.stopPropagation();
    const d = drag.current;
    drag.current = null;
    if (!d || d.mode !== "swipe") return;
    swiped.current = true;
    const w = track.current?.clientWidth || 1;
    // A slow pull past the threshold, or a quick flick either way — one line.
    if (d.dx < -w * THRESHOLD || d.v < -FLICK) go(page + 1);
    else if (d.dx > w * THRESHOLD || d.v > FLICK) go(page - 1);
    else go(page);
  }

  /** A trackpad's sideways scroll: one line per gesture, not per tick. */
  function onWheel(e: React.WheelEvent) {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 12) return;
    if (e.timeStamp - wheelAt.current < 450) return;
    wheelAt.current = e.timeStamp;
    go(page + (e.deltaX > 0 ? 1 : -1));
  }

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
      <div
        ref={track}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={stop}
        onTouchMove={stop}
        onTouchEnd={stop}
        onWheel={onWheel}
        onClickCapture={(e) => {
          if (!swiped.current) return;
          swiped.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
        // Tabbing to a colour on another line brings that line in. The
        // browser would otherwise scroll this clipped box itself to show it.
        onFocusCapture={(e) => {
          const at = (e.target as HTMLElement).closest<HTMLElement>("[data-page]");
          if (track.current) track.current.scrollLeft = 0;
          if (at) go(Number(at.dataset.page));
        }}
        className="overflow-hidden"
        // Up and down stay the page's; sideways is ours from the first touch.
        style={{ touchAction: "pan-y" }}
      >
        <div ref={strip} className="flex will-change-transform" style={{ transform: opening }}>
          {groups.map((g, i) => (
            <div
              key={g.key}
              data-page={i}
              role="group"
              aria-label={g.label}
              className="grid w-full shrink-0 grid-cols-8 justify-items-center gap-2 px-[3px] py-1"
            >
              {g.colors.map((c) => (
                <SquircleSwatch
                  key={c.key}
                  label={c.label}
                  selected={value === c.key}
                  background={c.background}
                  onClick={() => onChange(c.key)}
                  size={size}
                  fill
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {groups.length > 1 && (
        <div className="-my-1 flex items-center justify-center">
          {groups.map((g, i) => (
            <button
              key={g.key}
              type="button"
              onClick={() => go(i)}
              aria-label={`${g.label} colours`}
              aria-current={i === page}
              // A comfortable target around a 6px dot.
              className="flex h-6 items-center justify-center px-1"
            >
              <span
                className={`block h-1.5 rounded-full transition-all duration-300 ${i === page ? "w-4 bg-white/85" : "w-1.5 bg-white/30"}`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
