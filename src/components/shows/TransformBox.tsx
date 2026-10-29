"use client";

import { useRef, useState } from "react";
import { layerBox } from "@/lib/show-layers";
import { dragged, pinched, pulled, swung, type Placed, type Point } from "@/lib/transform-gesture";

/** How far the handles sit outside the thing, and how big they are. */
const HANDLE = 15;
const ROTATE_ARM = 30;

/**
 * The selection box around the layer being arranged.
 *
 * Drag the middle to move it, pull the corner to size it, swing the
 * handle above to turn it — or pinch, which the frame placer this is
 * generalised from never had because an admin screen has a mouse.
 *
 * The handles are counter-scaled by the layer's own scale, so a sticker
 * shrunk to a quarter still has handles a thumb can find. That is
 * FramePlacer's trick and the reason its chrome works at any size.
 *
 * Nothing here is written to React per frame: the gesture updates
 * through `onChange` on each pointer move, which the editor keeps in one
 * piece of state. A layer is one small object, so this is a cheap render
 * — unlike the chat swipe, which had to go round React entirely.
 */
export function TransformBox({
  placed,
  frame,
  onChange,
  onCommit,
  children,
}: {
  placed: Placed;
  frame: { width: number; height: number };
  onChange: (next: Placed) => void;
  /** The gesture ended — the moment to put one entry on the undo stack. */
  onCommit?: () => void;
  children: React.ReactNode;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState<"move" | "scale" | "rotate" | "pinch" | null>(null);
  /** Live pointers, so two of them can become a pinch. */
  const touches = useRef(new Map<number, Point>());
  /** Where each finger started, so a pinch measures from the beginning. */
  const startPoints = useRef(new Map<number, Point>());

  const box = layerBox(placed, frame);
  const centre: Point = { x: box.left, y: box.top };
  // Handles stay the same size on screen however small the layer is.
  const u = 1 / Math.max(0.0001, placed.scale);

  /**
   * The three handlers are attached directly rather than built by a
   * factory. `begin("move")` would run during render, and the compiler
   * then sees the closure it returns reading refs in the render scope
   * and refuses it — the shape SwipeRow already uses for the same
   * reason.
   */
  function onMoveDown(e: React.PointerEvent) {
    gesture("move", e);
  }
  function onScaleDown(e: React.PointerEvent) {
    gesture("scale", e);
  }
  function onRotateDown(e: React.PointerEvent) {
    gesture("rotate", e);
  }

  function gesture(kind: "move" | "scale" | "rotate", e: React.PointerEvent) {
    {
      e.preventDefault();
      e.stopPropagation();

      // Everything that reads a ref lives in here. A helper declared in
      // the component body would be the same code, but the compiler
      // cannot see that it is only ever called from a handler and
      // refuses it as a ref read during render.
      const live = touches.current;
      const began = startPoints.current;
      const rect = host.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      // Back into the frame's own pixels: the editor may lay the frame
      // out at any width, and positions are fractions of it.
      const k = frame.width / rect.width;
      const pointIn = (ev: { clientX: number; clientY: number }): Point => ({
        x: (ev.clientX - rect.left) * k,
        y: (ev.clientY - rect.top) * k,
      });

      const start = pointIn(e);
      const from = { ...placed };
      setBusy(kind);
      live.set(e.pointerId, start);
      // Capture is a nicety — it keeps the gesture alive if the finger
      // leaves the handle. It throws when the pointer is already gone,
      // and it used to do so *before* the window listeners below were
      // added, which silently killed the whole gesture: dragging worked
      // and the two handles did nothing at all.
      try {
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } catch {
        // Nothing to do: the listeners below work without it.
      }

      const move = (ev: PointerEvent) => {
        const now = pointIn(ev);
        live.set(ev.pointerId, now);

        // Two fingers beat whichever handle started it: a pinch is
        // unambiguous and a half-finished drag is not.
        if (live.size >= 2) {
          const ids = [...live.keys()].slice(0, 2);
          const a = live.get(ids[0])!;
          const b = live.get(ids[1])!;
          const startA = began.get(ids[0]) ?? a;
          const startB = began.get(ids[1]) ?? b;
          setBusy("pinch");
          onChange(pinched(from, startA, startB, a, b));
          return;
        }

        if (kind === "move") onChange(dragged(from, start, now, frame));
        else if (kind === "scale") onChange(pulled(from, centre, start, now));
        else onChange(swung(from, centre, start, now));
      };

      const end = (ev: PointerEvent) => {
        live.delete(ev.pointerId);
        began.delete(ev.pointerId);
        if (live.size > 0) return;
        setBusy(null);
        onCommit?.();
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
      };

      began.set(e.pointerId, start);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    }
  }

  const dot = (extra: React.CSSProperties): React.CSSProperties => ({
    position: "absolute",
    width: HANDLE,
    height: HANDLE,
    borderRadius: 4,
    background: "#0a0a0a",
    border: "2px solid #a3e635",
    transform: `scale(${u})`,
    ...extra,
  });

  return (
    <div ref={host} className="absolute inset-0" style={{ touchAction: "none" }}>
      <div
        className="absolute"
        style={{
          left: box.left,
          top: box.top,
          transform: box.transform,
          transformOrigin: "center",
          cursor: busy === "move" ? "grabbing" : "grab",
        }}
        onPointerDown={onMoveDown}
      >
        <div className="relative">
          {children}

          {/* The frame itself. */}
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              inset: -6 * u,
              border: `${1.5 * u}px solid #a3e635`,
              borderRadius: 6 * u,
            }}
          />

          {/* Three corners are decoration; the fourth sizes it, which is
              the frame placer's arrangement and enough for one thumb. */}
          <span aria-hidden style={dot({ left: -HANDLE / 2, top: -HANDLE / 2 })} />
          <span aria-hidden style={dot({ right: -HANDLE / 2, top: -HANDLE / 2 })} />
          <span aria-hidden style={dot({ left: -HANDLE / 2, bottom: -HANDLE / 2 })} />
          <button
            type="button"
            aria-label="Resize"
            onPointerDown={onScaleDown}
            style={{
              ...dot({ right: -HANDLE / 2, bottom: -HANDLE / 2 }),
              background: "#a3e635",
              cursor: "nwse-resize",
              padding: 0,
            }}
          />

          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: "50%",
              top: -ROTATE_ARM * u,
              width: 1.5 * u,
              height: ROTATE_ARM * u,
              marginLeft: -0.75 * u,
              background: "#a3e635",
            }}
          />
          <button
            type="button"
            aria-label="Rotate"
            onPointerDown={onRotateDown}
            style={{
              position: "absolute",
              left: "50%",
              top: -(ROTATE_ARM + HANDLE) * u,
              width: HANDLE + 5,
              height: HANDLE + 5,
              marginLeft: -(HANDLE + 5) / 2,
              borderRadius: "50%",
              background: "#0a0a0a",
              border: "2px solid #a3e635",
              transform: `scale(${u})`,
              cursor: "grab",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#a3e635" strokeWidth="3" strokeLinecap="round" aria-hidden>
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
