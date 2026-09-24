"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { haptics } from "@/lib/haptics";

/** Hold this long and the fan opens. Shorter is a tap. */
const HOLD_MS = 280;
/** How close the finger must come to an emoji to pick it. */
const REACH = 46;

type Spot = { x: number; y: number };

/**
 * One button to react to a page with.
 *
 * A tap sends the emoji on its face — the one you sent last, ❤️ to begin
 * with. Hold it and a fan of emoji opens up and to the left of it (the
 * button sits at the right edge, so the fan opens inward); slide to one, and
 * let go to send it. Let go on ⋯ for every emoji, or anywhere off the fan to
 * send nothing. The same hold-and-slide as the tabs in the bottom bar.
 *
 * Without a finger: right-click, or ↑ on the keyboard, opens the fan to click
 * or tab through, and Escape or a click elsewhere closes it.
 *
 * The fan is drawn in <body>, so no card's rounded corners clip it.
 */
export function ReactFan({
  face,
  quick,
  label,
  optionLabel,
  onPick,
  onMore,
  onOpenChange,
  size = "card",
}: {
  /** What a tap sends, shown on the button. */
  face: string;
  /** The emoji in the fan, before ⋯. */
  quick: readonly string[];
  /** The button's name, e.g. "React to Aman's page". */
  label: string;
  /** Each emoji's name in the fan, e.g. (e) => `Send ${e} to Aman`. */
  optionLabel: (emoji: string) => string;
  /** An emoji chosen — by a tap (the face) or from the fan. */
  onPick: (emoji: string, from: HTMLElement) => void;
  /** ⋯ chosen: open every emoji, from this button. */
  onMore: (from: HTMLElement) => void;
  /** Open or closed — full-screen pages hold still while it is open. */
  onOpenChange?: (open: boolean) => void;
  size?: "card" | "screen";
}) {
  const btn = useRef<HTMLButtonElement>(null);
  /** The fan, while open: where each emoji sits, and the button's centre it flies out of. */
  const [fan, setFan] = useState<{ spots: Spot[]; from: Spot } | null>(null);
  const [active, setActive] = useState<number | null>(null);
  /** Opened by a right-click or the keyboard: chosen by clicking, not by letting go. */
  const [detached, setDetached] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const pressed = useRef(false);
  /** The press became a hold, so the click it ends in is not a tap. */
  const held = useRef(false);
  const items = [...quick, "⋯"];
  const spots = fan?.spots ?? null;
  const open = fan !== null;
  const big = size === "screen";

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Where each emoji sits: an arc from the button's left round to above it. */
  function layout() {
    const r = btn.current!.getBoundingClientRect();
    const from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    // Wide enough that the one grown under the finger does not crowd its neighbours.
    const radius = big ? 134 : 120;
    return {
      from,
      spots: items.map((_, i) => {
        const a = ((182 + (i * 86) / (items.length - 1)) * Math.PI) / 180;
        return { x: from.x + Math.cos(a) * radius, y: from.y + Math.sin(a) * radius };
      }),
    };
  }

  function openFan(asDetached: boolean) {
    if (!btn.current) return;
    haptics.select();
    held.current = !asDetached;
    setDetached(asDetached);
    setActive(null);
    setFan(layout());
    onOpenChange?.(true);
  }

  function close() {
    window.clearTimeout(timer.current);
    setFan(null);
    setActive(null);
    setDetached(false);
    onOpenChange?.(false);
  }

  function choose(i: number) {
    const b = btn.current;
    close();
    if (!b) return;
    const e = items[i];
    if (e === "⋯") onMore(b);
    else onPick(e, b);
  }

  function hit(x: number, y: number): number | null {
    if (!spots) return null;
    let best: number | null = null;
    let bd = REACH;
    spots.forEach((s, i) => {
      const d = Math.hypot(x - s.x, y - s.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  // Escape closes a fan opened without a finger.
  useEffect(() => {
    if (!open || !detached) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only reads state setters and the latest onOpenChange
  }, [open, detached]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-keyshortcuts="ArrowUp"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          if (open) return;
          pressed.current = true;
          held.current = false;
          try {
            e.currentTarget.setPointerCapture(e.pointerId); // moves keep coming once the finger leaves the button
          } catch {
            /* the fan still opens; sliding needs the finger to stay near */
          }
          timer.current = window.setTimeout(() => openFan(false), HOLD_MS);
        }}
        onPointerMove={(e) => {
          if (!open || detached) return;
          const i = hit(e.clientX, e.clientY);
          if (i !== active) {
            setActive(i);
            if (i !== null) haptics.select();
          }
        }}
        onPointerUp={(e) => {
          if (!pressed.current) return;
          pressed.current = false;
          window.clearTimeout(timer.current);
          if (open && !detached) {
            const i = hit(e.clientX, e.clientY) ?? active;
            if (i === null) close();
            else choose(i);
          }
        }}
        onPointerCancel={() => {
          pressed.current = false;
          window.clearTimeout(timer.current);
          if (open && !detached) close();
        }}
        onClick={(e) => {
          // The end of a hold is not a tap; a tap sends the face.
          if (held.current) {
            held.current = false;
            return;
          }
          if (open) return;
          onPick(face, e.currentTarget);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPick(face, e.currentTarget);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            openFan(true);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!pressed.current) openFan(true); // a right-click; a long touch is the hold's
        }}
        className={`flex shrink-0 select-none items-center justify-center rounded-full leading-none transition-[scale,background-color] duration-150 ${
          big ? "h-12 w-12 text-[24px]" : "h-10 w-10 text-[20px]"
        } ${open ? "scale-90 bg-white/25" : "bg-white/[0.12] hover:bg-white/[0.18]"}`}
        style={{ touchAction: "none", WebkitTouchCallout: "none" }}
      >
        {face}
      </button>

      {fan &&
        spots &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="menu"
            aria-label="Pick an emoji"
            className="fixed inset-0 z-[130]"
            // Opened without a finger, a click off the fan closes it.
            onClick={detached ? close : undefined}
            style={{ pointerEvents: detached ? "auto" : "none" }}
          >
            {spots.map((s, i) => {
              const on = i === active;
              const more = items[i] === "⋯";
              return (
                <button
                  key={items[i]}
                  type="button"
                  role="menuitem"
                  tabIndex={detached ? 0 : -1}
                  autoFocus={detached && i === 0}
                  aria-label={more ? "More emoji" : optionLabel(items[i])}
                  onClick={(e) => {
                    e.stopPropagation();
                    choose(i);
                  }}
                  onPointerEnter={detached ? () => setActive(i) : undefined}
                  // A see-through, frosted disc, no ring: it keeps each emoji
                  // clear over any page colour without boxing it in. The one
                  // under the finger says so by popping up — a springy
                  // overshoot past its size, then settling — lifted and a
                  // little brighter behind. Leaving, it just shrinks back.
                  className={`absolute flex items-center justify-center rounded-full leading-none backdrop-blur-md transition-[scale,translate,background-color] shadow-[0_10px_22px_-10px_rgb(0_0_0/0.6)] ${
                    big ? "h-[52px] w-[52px] text-[28px]" : "h-12 w-12 text-[26px]"
                  } ${
                    on
                      ? "z-10 -translate-y-2 scale-[1.4] bg-white/[0.3] duration-300 ease-[cubic-bezier(0.34,1.9,0.5,1)]"
                      : "bg-white/[0.16] duration-150 ease-out"
                  }`}
                  style={
                    {
                      left: s.x,
                      top: s.y,
                      marginLeft: big ? -26 : -24,
                      marginTop: big ? -26 : -24,
                      pointerEvents: detached ? "auto" : "none",
                      // Each flies out of the button along its own line.
                      ["--dx"]: `${fan.from.x - s.x}px`,
                      ["--dy"]: `${fan.from.y - s.y}px`,
                      animation: `arc-fan 300ms cubic-bezier(0.2,1.12,0.4,1) ${i * 28}ms backwards`,
                    } as React.CSSProperties
                  }
                >
                  {more ? <span className="text-[17px] font-black tracking-[0.12em] text-white">•••</span> : items[i]}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
