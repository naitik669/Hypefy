"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { SquircleSwatch } from "@/components/ui/SquircleSwatch";

export type PagerGroup = {
  key: string;
  label: string;
  colors: { key: string; label: string; background: string }[];
};

/**
 * Colours a line at a time: one group fills the line, and a swipe brings
 * the next group's whole line in (scroll-snap, a page per swipe). Dots
 * under it say how many lines there are and which you are on; tapping one
 * goes there. It opens on the line holding the colour already chosen.
 *
 * So there can be as many colours as there are groups of eight, and the
 * line never gets busier than eight.
 *
 * Touches stop here: this sits inside cards and sheets that have swipes of
 * their own, and a swipe through colours must not also move those.
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
  const start = Math.max(0, groups.findIndex((g) => g.colors.some((c) => c.key === value)));
  const [page, setPage] = useState(start);

  // Open on the chosen colour's line, without an animated slide to it.
  useLayoutEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = start * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only where it opens
  }, []);

  function onScroll() {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    const now = Math.round(el.scrollLeft / el.clientWidth);
    if (now !== page) setPage(now);
  }

  function go(i: number) {
    const el = track.current;
    el?.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
      <div
        ref={track}
        onScroll={onScroll}
        onPointerDown={stop}
        onPointerMove={stop}
        onPointerUp={stop}
        onTouchStart={stop}
        onTouchMove={stop}
        onTouchEnd={stop}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {groups.map((g) => (
          <div
            key={g.key}
            role="group"
            aria-label={g.label}
            className="grid w-full shrink-0 snap-start snap-always grid-cols-8 justify-items-center gap-2 px-[3px] py-1"
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
