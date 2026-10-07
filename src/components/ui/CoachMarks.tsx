"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type CoachStep = {
  /** Storage key suffix, shared with FeatureHint: one read tip is one read tip. */
  id: string;
  /** The `data-coach` value of the real control this points at. */
  target: string;
  title: string;
  text: string;
  /** What to do to move on, said as an invitation: "Tap the star". */
  tryIt?: string;
};

const key = (id: string) => `hypefy_hint_${id}`;
/** Room left around the control inside the ring. */
const PAD = 6;
/** How far the bubble sits from the ring. */
const GAP = 14;
const BUBBLE_W = 272;
const EDGE = 12;
/** The room a bubble is assumed to need, when choosing under or over. */
const BUBBLE_ROOM = 170;

function isDone(id: string): boolean {
  try {
    return localStorage.getItem(key(id)) === "1";
  } catch {
    // Private mode: say nothing rather than say it on every visit.
    return true;
  }
}
function markDone(id: string) {
  try {
    localStorage.setItem(key(id), "1");
  } catch {
    /* nothing to do */
  }
}

type Box = { top: number; left: number; width: number; height: number };

const find = (target: string) => document.querySelector<HTMLElement>(`[data-coach="${target}"]`);

/** Where the control is, or null if it is not on screen enough to point at. */
export function boxOf(el: Element | null, viewport: { width: number; height: number }): Box | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  if (r.bottom < 56 || r.top > viewport.height - 56 || r.right < 8 || r.left > viewport.width - 8) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Where the bubble goes: under the control if there is room, else over it. */
export function placeBubble(box: Box, viewport: { width: number; height: number }, bubbleHeight: number) {
  const below = box.top + box.height + PAD + GAP + bubbleHeight + EDGE <= viewport.height;
  const width = Math.min(BUBBLE_W, viewport.width - EDGE * 2);
  const centre = box.left + box.width / 2;
  const left = Math.max(EDGE, Math.min(viewport.width - EDGE - width, centre - width / 2));
  const top = below ? box.top + box.height + PAD + GAP : box.top - PAD - GAP - bubbleHeight;
  return {
    top: Math.max(EDGE, top),
    left,
    width,
    below,
    // The arrow points at the middle of the control, kept inside the bubble's corners.
    arrow: Math.max(18, Math.min(width - 18, centre - left)),
  };
}

/**
 * Tips that point at the thing itself.
 *
 * A ring is drawn round the real control, the rest of the screen dims, and
 * a small bubble with an arrow says what it is. Nothing is blocked: the
 * control underneath works, and using it is how the tip is finished and the
 * next one comes up. "Got it" does the same without doing the thing; "Skip
 * tips" ends the lot.
 *
 * One at a time, in order, each shown once. A tip whose control is not on
 * the screen (no posts yet, say) is passed over until a visit when it is.
 */
export function CoachMarks({ steps, delayMs = 900 }: { steps: CoachStep[]; delayMs?: number }) {
  const [step, setStep] = useState<CoachStep | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const stepsRef = useRef(steps);

  /** The first tip not yet read whose control exists right now. */
  const pick = useCallback((after?: string) => {
    const list = stepsRef.current;
    const from = after ? list.findIndex((s) => s.id === after) + 1 : 0;
    return list.slice(from).find((s) => !isDone(s.id) && find(s.target)) ?? null;
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setStep(pick()), delayMs);
    return () => clearTimeout(t);
  }, [pick, delayMs]);

  const finish = useCallback(
    (s: CoachStep, wait = 0) => {
      markDone(s.id);
      setStep(null);
      setBox(null);
      // The next one comes up in the same visit: that is the "tutorial" of it.
      setTimeout(() => setStep(pick(s.id)), wait);
    },
    [pick],
  );

  function skipAll() {
    for (const s of stepsRef.current) markDone(s.id);
    setStep(null);
    setBox(null);
  }

  // Follow the control: it scrolls with the page, and some of them move.
  useEffect(() => {
    if (!step) return;
    let frame = 0;
    const tick = () => {
      const next = boxOf(find(step.target), { width: window.innerWidth, height: window.innerHeight });
      setBox((prev) =>
        prev && next && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step]);

  // Using the control is the way through.
  useEffect(() => {
    if (!step) return;
    const onClick = (e: MouseEvent) => {
      const el = find(step.target);
      if (el && e.target instanceof Node && el.contains(e.target)) finish(step, 700);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [step, finish]);

  if (!step || !box || typeof document === "undefined") return null;

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const at = placeBubble(box, viewport, BUBBLE_ROOM);
  const index = steps.findIndex((s) => s.id === step.id);

  return createPortal(
    <div data-coach-mark={step.id} className="pointer-events-none fixed inset-0 z-[250]">
      {/* The ring. Its shadow is the dimming: one element, nothing to line up. */}
      <div
        aria-hidden
        className="animate-coach-ring absolute rounded-2xl border-2 border-accent"
        style={{
          top: box.top - PAD,
          // Kept on the screen: a control as wide as the page (the Shows
          // row) would otherwise have a ring whose sides cannot be seen.
          left: Math.max(4, box.left - PAD),
          width: Math.min(viewport.width - 4, box.left + box.width + PAD) - Math.max(4, box.left - PAD),
          height: box.height + PAD * 2,
          boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.62)",
        }}
      />
      <div
        role="dialog"
        aria-label={step.title}
        className="pointer-events-auto absolute rounded-2xl bg-elevated px-4 pb-3 pt-3.5 text-left shadow-2xl ring-1 ring-border"
        // Over the control it is pinned by its foot, so however tall the
        // words make it, it ends the same distance above the ring.
        style={
          at.below
            ? { top: at.top, left: at.left, width: at.width }
            : { bottom: viewport.height - (box.top - PAD - GAP), left: at.left, width: at.width }
        }
      >
        <span
          aria-hidden
          className="absolute h-3 w-3 rotate-45 bg-elevated ring-1 ring-border"
          style={{
            left: at.arrow - 6,
            ...(at.below ? { top: -6, clipPath: "polygon(0 0, 100% 0, 0 100%)" } : { bottom: -6, clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }),
          }}
        />
        <p className="text-sm font-extrabold leading-tight">{step.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{step.text}</p>
        {step.tryIt && <p className="mt-2 text-xs font-bold text-accent">{step.tryIt}</p>}
        <div className="mt-3 flex items-center gap-2">
          {steps.length > 1 && (
            <span className="text-[11px] tabular-nums text-faint">
              {index + 1} of {steps.length}
            </span>
          )}
          <button type="button" onClick={skipAll} className="ml-auto h-8 px-2 text-xs font-bold text-muted">
            Skip tips
          </button>
          <button
            type="button"
            onClick={() => finish(step, 250)}
            className="h-8 rounded-xl bg-accent px-3.5 text-xs font-extrabold text-accent-ink"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
