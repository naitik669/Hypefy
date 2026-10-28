"use client";

import { useEffect, useRef, useState } from "react";
import { Reply, Pencil } from "lucide-react";
import { ShareIcon } from "@/components/ui/ShareIcon";
import {
  SWIPE_MAX_PX,
  SWIPE_SLOP_PX,
  SWIPE_TRIGGER_PX,
  type SwipeAction,
  swipeLabel,
} from "@/lib/chat-gestures";

/**
 * A message row you can swipe.
 *
 * The thread is a vertical scroller first, so the gesture is not claimed
 * until the finger has gone SWIPE_SLOP_PX sideways *and* further sideways
 * than down. Until then every event passes through untouched and a flick
 * down the conversation does not nudge a bubble.
 *
 * **Nothing about the drag goes through React.** The first version kept the
 * live gesture in state, which cost two things. It re-rendered on the frame
 * the swipe was claimed — a hitch exactly where the movement starts, which
 * is the part a finger notices. And `onPointerUp` read the action out of
 * that state, so a quick flick, where claim and release land in the same
 * tick, found it still empty and did nothing: the swipe simply failed, more
 * often the faster you did it.
 *
 * So the action lives in a ref, the position is written straight to the
 * node inside one requestAnimationFrame, and the layer is promoted for the
 * length of the gesture. React renders once, when the icon appears.
 *
 * Only `transform` and `opacity` are animated. `clip-path` is not
 * composited in Android's WebView, so a reveal drawn by clipping repaints
 * the whole row every frame — the reason the music title had to be rebuilt.
 */
export function SwipeRow({
  actionFor,
  onAction,
  onClaim,
  children,
}: {
  /** What a swipe this way would do, or null for nothing. */
  actionFor: (direction: "left" | "right") => SwipeAction | null;
  onAction: (action: SwipeAction) => void;
  /** Called once the gesture is taken, so the row can drop its long-press. */
  onClaim: () => void;
  children: React.ReactNode;
}) {
  const slider = useRef<HTMLDivElement | null>(null);
  const glyph = useRef<HTMLSpanElement | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const claimed = useRef(false);
  const offset = useRef(0);
  /**
   * The action this gesture will perform.
   *
   * A ref, not state: it is read on release, and a flick fast enough to
   * claim and let go inside one tick would read state that had not landed
   * yet and do nothing.
   */
  const action = useRef<SwipeAction | null>(null);
  /** Whether the finger is currently past the point of no return. */
  const armed = useRef(false);
  const frame = useRef(0);
  const want = useRef(0);
  /**
   * Which gesture this is.
   *
   * The mark is held for the length of its fade rather than torn off the
   * moment the finger lifts, and a new swipe must not have the previous
   * one's cleanup land on top of it.
   */
  const gen = useRef(0);

  // Which glyph is showing, and on which side. The one piece of this that
  // has to be rendered, so it is set once per gesture and never during it.
  const [showing, setShowing] = useState<{ action: SwipeAction; side: "left" | "right" } | null>(
    null,
  );

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /** One write per frame, however many pointer events arrive. */
  function schedule() {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = slider.current;
      if (!el) return;
      el.style.transform = `translate3d(${want.current}px, 0, 0)`;
      const g = glyph.current;
      if (!g) return;
      // The mark grows out of nothing and turns over as the trigger is
      // reached: a dark squircle with a white arrow becomes a lime
      // squircle with a deep-lime arrow, so the moment letting go starts
      // to mean something is a colour you cannot miss rather than a few
      // pixels of travel you have to judge.
      const reach = Math.min(1, Math.abs(want.current) / SWIPE_TRIGGER_PX);
      // The colour is weighted late while the size is linear, so the turn
      // lands with the trigger instead of halfway to it.
      const turn = reach * reach;
      const t = palette();
      g.style.opacity = String(Math.min(1, 0.25 + reach * 1.3));
      // A few per cent over full size once it is armed — the squircle
      // catching, rather than simply stopping.
      g.style.transform = `scale(${0.4 + reach * 0.6 + (reach >= 1 ? 0.06 : 0)})`;
      g.style.backgroundColor = mix(t.rest, t.lit, turn);
      g.style.color = mix(WHITE, t.ink, turn);
    });
  }

  function settle() {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    // The mark leaves the way it arrived rather than blinking out from
    // under the bubble that is still travelling home.
    const g = glyph.current;
    if (g) {
      g.style.transition = "opacity 180ms ease, transform 240ms cubic-bezier(.22,1,.36,1)";
      g.style.opacity = "0";
      g.style.transform = "scale(0.4)";
    }
    const mine = ++gen.current;
    window.setTimeout(() => {
      // Only if nothing has started since: a second swipe must not have
      // the first one's tidying land on top of it.
      if (gen.current === mine) setShowing(null);
    }, 220);
    const el = slider.current;
    if (el) {
      el.style.transition = reducedMotion()
        ? "none"
        : "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = "";
      // Dropped after the journey back, not during it: a layer promoted on
      // every row of a long thread is memory nobody asked for.
      window.setTimeout(() => {
        if (slider.current === el) el.style.willChange = "";
      }, 240);
    }
    start.current = null;
    claimed.current = false;
    armed.current = false;
    offset.current = 0;
    want.current = 0;
    action.current = null;
  }

  function onPointerDown(e: React.PointerEvent) {
    // Mouse drags are not a gesture anybody makes on a desktop thread, and
    // a stray drag with the button down would fire actions.
    if (e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e: React.PointerEvent) {
    const from = start.current;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;

    if (!claimed.current) {
      // Sideways, and more sideways than down. Both halves matter: the
      // first stops a tap from counting, the second leaves scrolling alone.
      if (Math.abs(dx) < SWIPE_SLOP_PX || Math.abs(dx) <= Math.abs(dy)) return;
      const next = actionFor(dx > 0 ? "right" : "left");
      if (!next) {
        // No action this way, so the row does not move at all. Rubber-banding
        // open on nothing reads as a broken gesture rather than as a limit.
        start.current = null;
        return;
      }
      claimed.current = true;
      action.current = next;
      gen.current++;
      const g = glyph.current;
      // Whatever is left of the last gesture's fade is dropped: the mark
      // has to follow the finger, not finish the previous animation.
      if (g) g.style.transition = "none";
      const el = slider.current;
      if (el) {
        // Set once, here. Writing the transition string on every move was a
        // style recalculation per frame for no change.
        el.style.transition = "none";
        el.style.willChange = "transform";
      }
      setShowing({ action: next, side: dx > 0 ? "left" : "right" });
      onClaim();
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }

    // Past the trigger it keeps moving, but at a third of the speed, so the
    // limit is felt as resistance rather than as a wall.
    const over = Math.max(0, Math.abs(dx) - SWIPE_TRIGGER_PX);
    const travel = Math.min(SWIPE_TRIGGER_PX + over / 3, SWIPE_MAX_PX);
    offset.current = dx > 0 ? travel : -travel;
    want.current = offset.current;

    // A tick the moment it becomes a real swipe, so the hand knows before
    // the eye does. Only on the way in — buzzing on every wobble over the
    // line is worse than not buzzing at all.
    const far = travel >= SWIPE_TRIGGER_PX;
    if (far && !armed.current) {
      armed.current = true;
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
    } else if (!far) {
      armed.current = false;
    }

    schedule();
  }

  function onPointerUp() {
    if (!claimed.current) {
      start.current = null;
      return;
    }
    const far = Math.abs(offset.current) >= SWIPE_TRIGGER_PX;
    const chosen = action.current;
    settle();
    if (far && chosen) onAction(chosen);
  }

  return (
    <div className="relative">
      {showing && (
        <span
          ref={glyph}
          aria-hidden
          style={{
            opacity: 0,
            transform: "scale(0.4)",
            // Promoted for the gesture: it is repainted on the same frames
            // the bubble is.
            willChange: "opacity, transform, background-color",
            backgroundColor: "var(--color-border)",
            color: "#ffffff",
          }}
          // A squircle, not a circle — the same corner the avatars and the
          // music case use, so the mark belongs to Hypefy rather than to
          // the gesture.
          className={`pointer-events-none absolute inset-y-0 my-auto flex h-9 w-9 items-center justify-center rounded-[32%] ${
            showing.side === "left" ? "left-3" : "right-3"
          }`}
        >
          <SwipeGlyph action={showing.action} />
        </span>
      )}
      <div
        ref={slider}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={settle}
        // The browser keeps vertical scrolling; we only ever take the
        // horizontal part.
        style={{ touchAction: "pan-y" }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Inside the squircle, and taking its colour from it — so the one write
 * that turns the plate lime turns the arrow deep-lime with it.
 */
function SwipeGlyph({ action }: { action: SwipeAction }) {
  const label = swipeLabel(action);
  if (action === "reply") return <Reply size={19} strokeWidth={2.4} aria-label={label} />;
  if (action === "edit") return <Pencil size={17} strokeWidth={2.4} aria-label={label} />;
  return <ShareIcon size={18} weight="bold" aria-label={label} />;
}

type RGB = readonly [number, number, number];

const WHITE: RGB = [255, 255, 255];

/** "#a3e635" or "#abc" to channels, or null if it is neither. */
function parseHex(raw: string): RGB | null {
  const hex = raw.trim().replace(/^#/, "");
  if (hex.length === 3) {
    const n = Number.parseInt(hex, 16);
    if (Number.isNaN(n)) return null;
    const r = (n >> 8) & 0xf, g = (n >> 4) & 0xf, b = n & 0xf;
    return [r * 17, g * 17, b * 17];
  }
  if (hex.length !== 6) return null;
  const n = Number.parseInt(hex, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

let cached: { rest: RGB; lit: RGB; ink: RGB } | null = null;

/**
 * The three colours the mark moves between, read from the page's own
 * tokens rather than written out here, so a change to the brand reaches
 * the gesture without anybody remembering this file.
 *
 * Read once and kept: it is the same answer on every frame of every swipe,
 * and getComputedStyle is not something to call sixty times a second.
 */
function palette(): { rest: RGB; lit: RGB; ink: RGB } {
  if (cached) return cached;
  const fallback = {
    rest: [42, 42, 42] as RGB,
    lit: [163, 230, 53] as RGB,
    ink: [63, 98, 18] as RGB,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const css = getComputedStyle(document.documentElement);
    const pick = (name: string, dflt: RGB) => parseHex(css.getPropertyValue(name)) ?? dflt;
    cached = {
      rest: pick("--color-border", fallback.rest),
      lit: pick("--color-accent", fallback.lit),
      ink: pick("--color-accent-deep", fallback.ink),
    };
    return cached;
  } catch {
    return fallback;
  }
}

/** Part of the way from one colour to another. */
function mix(from: RGB, to: RGB, t: number): string {
  const at = Math.min(1, Math.max(0, t));
  const c = (i: number) => Math.round(from[i] + (to[i] - from[i]) * at);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
