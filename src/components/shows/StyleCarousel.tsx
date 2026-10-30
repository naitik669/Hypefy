"use client";

import { useEffect, useRef } from "react";

const ITEM = 56;
const GAP = 14;

/**
 * Styles as icons on a carousel, swiped or tapped, the middle one chosen —
 * framed in the lime box that does not move while the icons do. A song's
 * styles and an embed's both pick this way.
 */
export function StyleCarousel<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: K; name: string; icon: React.ReactNode }[];
  value: K;
  onChange: (next: K) => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const index = Math.max(0, options.findIndex((o) => o.key === value));

  // The chosen style sits in the middle of the row when this opens.
  useEffect(() => {
    const row = rowRef.current;
    if (row) row.scrollLeft = index * (ITEM + GAP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Swiping settles on whichever icon is in the middle. */
  function onRowScroll() {
    const row = rowRef.current;
    if (!row) return;
    const at = Math.round(row.scrollLeft / (ITEM + GAP));
    const next = options[Math.min(Math.max(at, 0), options.length - 1)];
    if (next && next.key !== value) onChange(next.key);
  }

  function pick(key: K) {
    const at = options.findIndex((o) => o.key === key);
    rowRef.current?.scrollTo({ left: at * (ITEM + GAP), behavior: "smooth" });
    onChange(key);
  }

  const pad = `calc(50% - ${ITEM / 2}px)`;

  return (
    <div>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 block h-[68px] w-[68px] -translate-x-1/2 -translate-y-1/2 rounded-[23px] border-[3px] border-accent"
        />
        <div
          ref={rowRef}
          role="radiogroup"
          aria-label={label}
          onScroll={onRowScroll}
          className="no-scrollbar flex snap-x snap-mandatory items-center overflow-x-auto py-2"
          style={{ gap: GAP, paddingLeft: pad, paddingRight: pad, touchAction: "pan-x" }}
        >
          {options.map((o) => {
            const on = o.key === value;
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={o.name}
                onClick={() => pick(o.key)}
                className={`flex shrink-0 snap-center items-center justify-center rounded-[19px] text-white transition ${
                  on ? "bg-white/25" : "bg-white/[0.14] opacity-70"
                }`}
                style={{ width: ITEM, height: ITEM }}
              >
                {o.icon}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-1.5 text-center text-xs font-extrabold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        {options[index]?.name}
      </p>
    </div>
  );
}
