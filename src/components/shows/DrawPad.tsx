"use client";

import { useEffect, useRef, useState } from "react";
import { Undo2 } from "lucide-react";
import {
  BRUSHES,
  INKS,
  SIZE_MAX,
  SIZE_MIN,
  paintAll,
  paintStroke,
  type Brush,
  type Stroke,
} from "@/lib/draw";

/**
 * The drawing on a Show, under the stickers: every stroke so far, painted
 * onto a canvas the size of the frame.
 */
export function DrawCanvas({ strokes, frame }: { strokes: Stroke[]; frame: { width: number; height: number } }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(frame.width * dpr);
    canvas.height = Math.round(frame.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintAll(ctx, strokes, frame.width, frame.height);
  }, [strokes, frame.width, frame.height]);
  if (strokes.length === 0) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0"
      style={{ width: frame.width, height: frame.height }}
      data-drawing
    />
  );
}

const BRUSH_NAME: Record<Brush, string> = {
  pen: "Pen",
  marker: "Marker",
  highlighter: "Highlight",
  neon: "Neon",
  arrow: "Arrow",
  eraser: "Eraser",
};

const BRUSH_ICON: Record<Brush, React.ReactNode> = {
  pen: <path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16z" />,
  marker: (
    <>
      <path d="M14 4l6 6-8 8H6v-6z" />
      <path d="M4 20h6" />
    </>
  ),
  highlighter: (
    <>
      <path d="M9 11l6-6 4 4-6 6" />
      <path d="M9 11l-3 3v3h3l4-2" />
      <path d="M4 21h16" />
    </>
  ),
  neon: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />,
  arrow: (
    <>
      <path d="M5 19L19 5" />
      <path d="M10 5h9v9" />
    </>
  ),
  eraser: (
    <>
      <path d="M16 4l5 5-10 10H6l-3-3z" />
      <path d="M9 11l5 5" />
    </>
  ),
};

const PEEL = "[filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.6))_drop-shadow(0_0_8px_rgba(0,0,0,0.3))]";

/**
 * Drawing: a finger on the picture leaves ink. Brushes along the foot,
 * inks under them, and size as a wedge down the left edge — thin at the
 * bottom, thick at the top, the way the stroke itself would be.
 */
export function DrawTools({
  frame,
  onStroke,
  canUndo,
  onUndo,
  onClear,
  onDone,
}: {
  frame: { width: number; height: number };
  onStroke: (stroke: Stroke) => void;
  canUndo: boolean;
  onUndo: () => void;
  onClear: () => void;
  onDone: () => void;
}) {
  const [brush, setBrush] = useState<Brush>("pen");
  const [color, setColor] = useState(INKS[0]);
  const [size, setSize] = useState(7);
  const live = useRef<HTMLCanvasElement | null>(null);

  function onDown(e: React.PointerEvent) {
    e.stopPropagation();
    const canvas = live.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(frame.width * dpr);
    canvas.height = Math.round(frame.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const k = frame.width / rect.width;
    const at = (ev: { clientX: number; clientY: number }) => ({ x: (ev.clientX - rect.left) * k, y: (ev.clientY - rect.top) * k });
    // The eraser shows where it has been as a faint trail while it works;
    // what it takes out is only seen once the stroke is kept.
    const stroke: Stroke = { brush, color: brush === "eraser" ? "rgba(255,255,255,0.35)" : color, size, points: [at(e)] };
    const redraw = () => {
      ctx.clearRect(0, 0, frame.width, frame.height);
      paintStroke(ctx, brush === "eraser" ? { ...stroke, brush: "highlighter" } : stroke);
    };
    redraw();
    const move = (ev: PointerEvent) => {
      stroke.points.push(at(ev));
      redraw();
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      ctx.clearRect(0, 0, frame.width, frame.height);
      onStroke({ ...stroke, color: brush === "eraser" ? "#000000" : color });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  return (
    <div className="absolute inset-0 z-40" onPointerDown={(e) => e.stopPropagation()} data-draw-tools>
      <canvas
        ref={live}
        onPointerDown={onDown}
        className="absolute left-0 top-0"
        style={{ width: frame.width, height: frame.height, touchAction: "none" }}
        aria-label="Drawing surface"
      />

      <div className={`absolute inset-x-2.5 top-3 flex items-center justify-between ${PEEL}`}>
        <div className="flex items-center">
          <button type="button" aria-label="Undo stroke" disabled={!canUndo} onClick={onUndo} className="flex h-11 w-11 items-center justify-center text-white disabled:opacity-40">
            <Undo2 size={25} strokeWidth={2.5} />
          </button>
          <button type="button" disabled={!canUndo} onClick={onClear} className="h-11 px-2.5 text-[15px] font-extrabold text-white disabled:opacity-40">
            Clear
          </button>
        </div>
        <button type="button" onClick={onDone} className="h-10 rounded-[14px] bg-accent px-5 text-[15px] font-extrabold text-accent-ink [filter:none] active:scale-95">
          Done
        </button>
      </div>

      {/* Size: a wedge down the left edge. */}
      <label className={`absolute left-3 top-1/2 flex h-[260px] w-9 -translate-y-1/2 flex-col items-center ${PEEL}`}>
        <span className="sr-only">Brush size</span>
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-0 -translate-x-1/2 border-x-[10px] border-t-[260px] border-x-transparent border-t-white/75" />
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full border-2 border-black/30 bg-white"
          style={{
            width: 10 + (size / SIZE_MAX) * 16,
            height: 10 + (size / SIZE_MAX) * 16,
            top: `calc(${(1 - (size - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)) * 100}% - ${(10 + (size / SIZE_MAX) * 16) / 2}px)`,
          }}
        />
        <input
          type="range"
          min={SIZE_MIN}
          max={SIZE_MAX}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="absolute left-1/2 top-1/2 h-9 w-[260px] -translate-x-1/2 -translate-y-1/2 -rotate-90 cursor-pointer opacity-0"
        />
      </label>

      <div role="radiogroup" aria-label="Brush" className="absolute inset-x-0 bottom-[calc(max(1.5rem,var(--sab))+50px)] flex justify-center gap-1">
        {BRUSHES.map((b) => {
          const on = b === brush;
          return (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={BRUSH_NAME[b]}
              onClick={() => setBrush(b)}
              className={`flex h-16 w-[54px] flex-col items-center justify-center gap-1 rounded-2xl text-white ${on ? "bg-white/25" : PEEL}`}
            >
              <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                {BRUSH_ICON[b]}
              </svg>
              <span className={`text-[11px] ${on ? "font-extrabold" : "font-bold"}`}>{BRUSH_NAME[b]}</span>
            </button>
          );
        })}
      </div>

      <div role="radiogroup" aria-label="Ink" className="absolute inset-x-0 bottom-[max(1.5rem,var(--sab))] flex justify-center gap-2">
        {INKS.map((ink) => {
          const on = ink === color && brush !== "eraser";
          return (
            <button
              key={ink}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`Ink ${ink}`}
              onClick={() => {
                setColor(ink);
                if (brush === "eraser") setBrush("pen");
              }}
              className={`h-9 w-9 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.35)] ${on ? "border-[3px] border-accent" : "border-2 border-white"}`}
              style={{ background: ink }}
            />
          );
        })}
      </div>
    </div>
  );
}
