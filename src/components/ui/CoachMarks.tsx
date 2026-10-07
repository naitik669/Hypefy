"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { nextHint, readHintState, withShown, withVisit, writeHintState } from "@/lib/hint-schedule";

export type Hint = {
  id: string;
  /** The `data-coach` value of the real control this points at. */
  target: string;
  /** One short line. A hint, not a lesson. */
  text: string;
};

/** How long a note stays up if nothing is done about it. */
export const HINT_STAYS_MS = 9000;
/** Room left around the control inside the ring. */
const PAD = 5;
/** How far the note sits from the ring. */
const GAP = 12;
const BUBBLE_W = 232;
const EDGE = 12;
/** The room a note is assumed to need, when choosing under or over. */
const BUBBLE_ROOM = 90;

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

/** Where the note goes: under the control if there is room, else over it. */
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
    // The arrow points at the middle of the control, kept inside the note's corners.
    arrow: Math.max(16, Math.min(width - 16, centre - left)),
  };
}

/**
 * A note pointing at a real control: a thin ring round it and one line with
 * an arrow.
 *
 * It does not dim the screen, block anything or ask to be answered. It goes
 * when the control is used, when its × is pressed, or by itself after a few
 * seconds; `onGone` says so. It follows the control as the page scrolls and
 * steps aside while the control is off the screen.
 *
 * When it is shown, and how often, is its caller's business.
 */
export function PointerNote({ id, target, text, onGone }: { id: string; target: string; text: string; onGone: () => void }) {
  const [box, setBox] = useState<Box | null>(null);
  const gone = useRef(onGone);
  useEffect(() => {
    gone.current = onGone;
  }, [onGone]);

  // It leaves by itself.
  useEffect(() => {
    const t = setTimeout(() => gone.current(), HINT_STAYS_MS);
    return () => clearTimeout(t);
  }, []);

  // Follow the control: it scrolls with the page, and some of them move.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const next = boxOf(find(target), { width: window.innerWidth, height: window.innerHeight });
      setBox((prev) =>
        prev && next && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  // Using the control is taking the hint.
  useEffect(() => {
    const onDown = (e: Event) => {
      const el = find(target);
      if (el && e.target instanceof Node && el.contains(e.target)) gone.current();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [target]);

  if (!box || typeof document === "undefined") return null;

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const at = placeBubble(box, viewport, BUBBLE_ROOM);
  const ringLeft = Math.max(4, box.left - PAD);

  return createPortal(
    <div data-hint={id} className="pointer-events-none fixed inset-0 z-[120]">
      <div
        aria-hidden
        className="animate-coach-ring absolute rounded-2xl border-[1.5px] border-accent"
        style={{
          top: box.top - PAD,
          // Kept on the screen: a control as wide as the page (the Shows
          // row) would otherwise have a ring whose sides cannot be seen.
          left: ringLeft,
          width: Math.min(viewport.width - 4, box.left + box.width + PAD) - ringLeft,
          height: box.height + PAD * 2,
        }}
      />
      <div
        role="status"
        className="animate-hint-in pointer-events-auto absolute flex items-start gap-1 rounded-2xl bg-foreground py-2 pl-3 pr-1 text-left text-background shadow-xl"
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
          className="absolute h-2.5 w-2.5 rotate-45 bg-foreground"
          style={{ left: at.arrow - 5, ...(at.below ? { top: -4 } : { bottom: -4 }) }}
        />
        <p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug">{text}</p>
        <button
          type="button"
          onClick={() => gone.current()}
          aria-label="Dismiss hint"
          className="-my-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-background/60"
        >
          <X size={14} strokeWidth={2.6} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * An occasional hint from a screen's pool.
 *
 * Which hint, and whether any, is decided by lib/hint-schedule: the first on
 * the first visit, then one now and then, never two together. Being shown is
 * what uses a hint up, so none comes back.
 */
export function HintPointer({
  screen,
  hints,
  delayMs = 1400,
}: {
  /** Names this screen's schedule: "home". */
  screen: string;
  /** In the order they should come. */
  hints: Hint[];
  delayMs?: number;
}) {
  const [hint, setHint] = useState<Hint | null>(null);
  const pool = useRef(hints);

  // One visit: count it, and see whether a hint is due.
  useEffect(() => {
    const list = pool.current;
    const ids = list.map((h) => h.id);
    const state = withVisit(readHintState(screen, ids));
    writeHintState(screen, state);
    const t = setTimeout(() => {
      const now = Date.now();
      const id = nextHint(ids, state, now, (x) => !!find(list.find((h) => h.id === x)!.target));
      const chosen = list.find((h) => h.id === id) ?? null;
      if (!chosen) return;
      // Shown is spent: a hint that was on screen is never shown again,
      // whether or not it was read.
      writeHintState(screen, withShown(state, chosen.id, now));
      setHint(chosen);
    }, delayMs);
    return () => clearTimeout(t);
  }, [screen, delayMs]);

  if (!hint) return null;
  return <PointerNote key={hint.id} id={hint.id} target={hint.target} text={hint.text} onGone={() => setHint(null)} />;
}
