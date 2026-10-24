"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The scroll-wheel the app picks dates and times on.
 *
 * Lifted out of DateOfBirthPicker unchanged, because the message scheduler
 * wanted the same thing and a second implementation of a drum is a second
 * set of scroll-feedback bugs. Whatever row sits under the centre band is
 * the value, so scrolling and tapping are the same gesture.
 *
 * Everything about the falloff, the debounce and the feedback guard is as it
 * was written for the birthday picker; the comments explaining why are kept
 * with the code they explain.
 */

/** Pixels per row. The band is exactly one row tall. */
export const WHEEL_ITEM_H = 44;
/** Rows visible at once. Odd, so one sits centred. */
export const WHEEL_VISIBLE = 5;

const ITEM_H = WHEEL_ITEM_H;
const VISIBLE = WHEEL_VISIBLE;
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export type WheelOption = { value: number; label: string };

/**
 * One drum of the wheel. Whatever row sits under the centre band is the value,
 * so scrolling and tapping are the same gesture. Rows fade and shrink with
 * distance from centre — that falloff is what makes the column read as a
 * physical drum instead of a list.
 */
export function WheelColumn({
  options,
  value,
  onChange,
  ariaLabel,
  align = "center",
}: {
  options: WheelOption[];
  value: number;
  onChange: (next: number) => void;
  ariaLabel: string;
  align?: "center" | "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = clamp(options.findIndex((o) => o.value === value), 0, options.length - 1);

  // Row that currently sits under the centre band. Tracked separately from
  // `index` because `index` only catches up once the scroll has settled —
  // driving the highlight from it made the whole drum fade out mid-scroll.
  const [centered, setCentered] = useState(index);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * Falloff, applied straight to the DOM.
   *
   * Kept out of React on purpose: this runs every scroll frame, and the year
   * column is ~126 rows — re-rendering all of them per frame to change two
   * numbers is what would make the wheel stutter. opacity and scale are both
   * composited, so writing them directly costs no layout.
   *
   * `pos` is fractional, so rows interpolate as they travel rather than
   * snapping between fixed steps. At whole numbers the curve reproduces the
   * original values exactly: 1, 0.4, 0.16, then the 0.07 floor.
   */
  const paint = useCallback((pos: number) => {
    const rows = rowRefs.current;
    for (let i = 0; i < rows.length; i++) {
      const el = rows[i];
      if (!el) continue;
      const d = Math.abs(i - pos);
      el.style.opacity = String(Math.max(0.07, Math.pow(0.4, d)));
      el.style.scale = String(Math.max(0.82, 1 - 0.1 * d));
    }
  }, []);

  // Index we last wrote or read. Without this the column feeds back on itself:
  // a scroll commits a value, the new value re-runs the align effect, that
  // scroll fires another event, and the drum walks away on its own.
  const committed = useRef(index);

  // Align on mount without animating — the sheet is still coming up.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = index * ITEM_H;
    committed.current = index;
    // First paint owns the falloff too — React no longer sets opacity/scale,
    // so without this every row would render fully opaque for a frame.
    paint(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-align only when the value changed from outside (day 31 clamped to 28
  // after switching to February, say) — never for our own scroll.
  useEffect(() => {
    if (index === committed.current) return;
    const el = ref.current;
    if (el) el.scrollTop = index * ITEM_H;
    committed.current = index;
    setCentered(index);
    paint(index);
  }, [index, paint]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;

    // Live, every frame: the row under the band is always the bright one.
    const pos = el.scrollTop / ITEM_H;
    paint(pos);
    const near = clamp(Math.round(pos), 0, options.length - 1);
    setCentered((prev) => (prev === near ? prev : near));

    // Committing the value stays debounced. It re-renders the sibling drums
    // (picking February rebuilds the day column), which is too much work to
    // do on every row the finger passes over.
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const i = clamp(Math.round(el.scrollTop / ITEM_H), 0, options.length - 1);
      if (i === committed.current) return;
      committed.current = i;
      const next = options[i];
      if (next && next.value !== value) onChange(next.value);
    }, 110);
  }

  function select(i: number) {
    const el = ref.current;
    committed.current = i;
    el?.scrollTo({ top: i * ITEM_H, behavior: "smooth" });
    const next = options[i];
    if (next && next.value !== value) onChange(next.value);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    select(clamp(index + (e.key === "ArrowDown" ? 1 : -1), 0, options.length - 1));
  }

  const justify =
    align === "left" ? "justify-start pl-5" : align === "right" ? "justify-end pr-5" : "justify-center";

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      className="no-scrollbar flex-1 snap-y snap-mandatory overflow-y-auto rounded-xl outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
      style={{ height: VISIBLE * ITEM_H }}
    >
      <div style={{ height: PAD }} aria-hidden />
      {options.map((o, i) => {
        // Only the type styling is React's: it changes when the centred row
        // changes, not every frame, and it alters font-size — animating that
        // per frame would relayout the column on every scroll tick.
        // opacity and scale belong to paint().
        const on = i === centered;
        return (
          <button
            key={o.value}
            // Cleanup matters here: the day column shrinks 31 → 28 when the
            // month changes, and paint() would otherwise keep writing to
            // detached nodes.
            ref={(el) => { rowRefs.current[i] = el; return () => { rowRefs.current[i] = null; }; }}
            type="button"
            role="option"
            aria-selected={on}
            tabIndex={-1}
            onClick={() => select(i)}
            style={{ height: ITEM_H }}
            className={`flex w-full snap-center items-center ${justify} whitespace-nowrap tabular-nums ${
              on ? "text-[19px] font-extrabold text-foreground" : "text-[17px] font-semibold text-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
      <div style={{ height: PAD }} aria-hidden />
    </div>
  );
}


/**
 * The chrome the drums sit in: the band that marks the centre row, and the
 * feather that stops the columns looking abruptly clipped.
 */
export function WheelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mt-1">
      {/* Selection band — the one bright element. Behind the drums, so the
          centred row reads as locked into it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-xl border border-accent/35 bg-accent/[0.10]"
        style={{ height: WHEEL_ITEM_H }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "linear-gradient(var(--color-elevated) 2%, transparent 30%, transparent 70%, var(--color-elevated) 98%)",
        }}
      />
      <div className="flex" data-sheet-no-drag>
        {children}
      </div>
    </div>
  );
}
