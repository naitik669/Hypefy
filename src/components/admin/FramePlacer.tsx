"use client";

import { useRef, useState } from "react";
import { AvatarImg } from "@/components/ui/AvatarImg";
import { framePlacement } from "@/lib/frames";

export type Placement = { scale: number; offsetX: number; offsetY: number; rotation: number };

/** What the sliders and the handles both clamp to, and what the database checks. */
export const LIMITS = {
  scale: [0.25, 3] as const,
  offset: [-1, 1] as const,
  rotation: [-180, 180] as const,
};

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

/** How much of the stage the avatar takes before the view zooms to fit. */
const AVATAR_SHARE = 0.34;

/** Room kept clear around the artwork for the handles that hang off it. */
const HANDLE_MARGIN = 56;

/**
 * Place a frame over an avatar by dragging it.
 *
 * The sliders this replaces worked, but nobody positions artwork by typing
 * a number into three boxes — you move the thing until it looks right. So
 * the art has a selection box: drag the middle to move it, pull a corner
 * to size it, swing the handle above to turn it, the way every design tool
 * does.
 *
 * All three are stored in avatar widths and degrees rather than in pixels,
 * so a frame placed once here is placed everywhere: the same numbers put
 * it in the same spot at 24px in a comment row and at 150px on a profile.
 * That is why the stage below is only a window onto the maths — its size
 * does not reach the saved placement at all.
 */
export function FramePlacer({
  src,
  value,
  onChange,
  avatar,
  stage = 300,
}: {
  src: string;
  value: Placement;
  onChange: (next: Placement) => void;
  avatar: { url: string | null; hue: number; name: string };
  /** The stage's side in px. See AVATAR_SHARE for why the avatar is small in it. */
  stage?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [grabbing, setGrabbing] = useState<null | "move" | "scale" | "rotate">(null);

  const size = Math.round(stage * AVATAR_SHARE);
  const pad = (stage - size) / 2;
  const box = framePlacement(size, value);

  /**
   * Zoom the whole view so the art and its handles always fit the stage.
   *
   * Without this the two gestures you need most are the two you cannot
   * reach: scaled up or pushed to an edge, the corner and the turn handle
   * fall outside the box — clipped away if the stage clips, drawn over the
   * controls beside it if it does not. Fitting the view is what a design
   * tool does, and it keeps the placement maths in stage units regardless.
   */
  const zoom = Math.min(1, (stage - 2 * HANDLE_MARGIN) / box.width);
  /** Undo the zoom, for chrome that should stay the same size on screen. */
  const u = 1 / zoom;

  // The art's centre, in stage coordinates. Every gesture is measured from it.
  const cx = pad + box.left + box.width / 2;
  const cy = pad + box.top + box.height / 2;

  function begin(kind: "move" | "scale" | "rotate") {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const host = ref.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      // The stage can be laid out at any size, and is zoomed on top of
      // that; work back to its own un-zoomed pixels, about its centre,
      // which is where the zoom is anchored.
      const k = stage / rect.width;
      const at = (ev: { clientX: number; clientY: number }) => ({
        x: ((ev.clientX - rect.left) * k - stage / 2) * u + stage / 2,
        y: ((ev.clientY - rect.top) * k - stage / 2) * u + stage / 2,
      });
      const start = at(e);
      const from = { ...value };
      const startDist = Math.hypot(start.x - cx, start.y - cy) || 1;
      const startAngle = Math.atan2(start.y - cy, start.x - cx);

      setGrabbing(kind);
      (e.target as Element).setPointerCapture?.(e.pointerId);

      const move = (ev: PointerEvent) => {
        const p = at(ev);
        if (kind === "move") {
          onChange({
            ...from,
            offsetX: clamp(from.offsetX + (p.x - start.x) / size, LIMITS.offset),
            offsetY: clamp(from.offsetY + (p.y - start.y) / size, LIMITS.offset),
          });
        } else if (kind === "scale") {
          // Distance from the centre, as a ratio of where the grab began —
          // so the art grows about its middle and the corner stays under
          // the finger.
          const d = Math.hypot(p.x - cx, p.y - cy);
          onChange({ ...from, scale: clamp(from.scale * (d / startDist), LIMITS.scale) });
        } else {
          const a = Math.atan2(p.y - cy, p.x - cx);
          let deg = from.rotation + ((a - startAngle) * 180) / Math.PI;
          // Snap to the eight obvious angles when close, which is most of
          // what anyone actually wants and is fiddly to hit by hand.
          const near = Math.round(deg / 45) * 45;
          if (Math.abs(deg - near) < 4) deg = near;
          onChange({ ...from, rotation: clamp(Math.round(deg), LIMITS.rotation) });
        }
      };
      const end = () => {
        setGrabbing(null);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    };
  }

  const handle = "absolute rounded-[3px] border border-black/40 bg-accent";
  const nub = { width: 12 * u, height: 12 * u };
  // One box, used twice: once for the artwork, once for the selection.
  const art = {
    left: pad + box.left,
    top: pad + box.top,
    width: box.width,
    height: box.height,
    transform: box.transform,
  };
  const fit = { transform: `scale(${zoom})` };

  return (
    <div
      ref={ref}
      className="relative mx-auto touch-none select-none"
      style={{ width: "100%", maxWidth: stage, aspectRatio: "1" }}
    >
      {/* The canvas. Clipped as a backstop, though the zoom above means
          there is normally nothing left to clip. */}
      <div
        className="absolute inset-0 overflow-hidden rounded-2xl border border-border"
        style={{
          background: "#0e0f10",
          // A checkerboard, so transparent artwork reads as transparent.
          backgroundImage:
            "linear-gradient(45deg, rgba(255,255,255,.035) 25%, transparent 25%, transparent 75%, rgba(255,255,255,.035) 75%), linear-gradient(45deg, rgba(255,255,255,.035) 25%, transparent 25%, transparent 75%, rgba(255,255,255,.035) 75%)",
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 10px 10px",
          cursor: grabbing === "move" ? "grabbing" : "default",
        }}
      >
        <div className="absolute inset-0" style={fit}>
          <div className="absolute" style={{ left: pad, top: pad, width: size, height: size }}>
            <AvatarImg url={avatar.url} name={avatar.name} hue={avatar.hue} size={size} />
            {/* Where the photo's edge falls, so you can see what you are framing. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full border border-dashed border-white/35"
            />
          </div>

          <div className="pointer-events-none absolute" style={art}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" draggable={false} className="h-full w-full select-none" />
          </div>
        </div>

        <span className="pointer-events-none absolute bottom-2 left-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">
          Drag to move · corner to size · handle to turn
        </span>
        {zoom < 1 && (
          <span className="pointer-events-none absolute right-2 top-2 font-mono text-[9px] tracking-[0.14em] text-white/40">
            {Math.round(zoom * 100)}%
          </span>
        )}
      </div>

      {/* The selection, over the clip rather than inside it. Everything
          here is counter-scaled so a handle is the same size to the hand
          however far the view has zoomed out. */}
      <div className="absolute inset-0" style={fit}>
        <div onPointerDown={begin("move")} className="absolute cursor-grab" style={art}>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 border-accent/80"
            style={{ borderWidth: u }}
          />

          {/* One corner does the sizing. Four would each need their own
              anchor rule; from the centre, one is the same gesture. */}
          <span
            onPointerDown={begin("scale")}
            role="slider"
            aria-label="Size"
            aria-valuenow={Math.round(value.scale * 100)}
            tabIndex={0}
            className={`${handle} cursor-nwse-resize`}
            style={{ ...nub, right: -6 * u, bottom: -6 * u }}
          />
          <span aria-hidden className={handle} style={{ ...nub, left: -6 * u, top: -6 * u, opacity: 0.45 }} />
          <span aria-hidden className={handle} style={{ ...nub, right: -6 * u, top: -6 * u, opacity: 0.45 }} />
          <span aria-hidden className={handle} style={{ ...nub, left: -6 * u, bottom: -6 * u, opacity: 0.45 }} />

          <span
            aria-hidden
            className="absolute left-1/2 bg-accent/80"
            style={{ top: -20 * u, height: 20 * u, width: u, transform: "translateX(-50%)" }}
          />
          <span
            onPointerDown={begin("rotate")}
            role="slider"
            aria-label="Rotation"
            aria-valuenow={value.rotation}
            tabIndex={0}
            className="absolute left-1/2 flex cursor-grab items-center justify-center rounded-full border border-black/40 bg-accent font-black text-accent-ink"
            style={{
              top: -44 * u,
              width: 24 * u,
              height: 24 * u,
              fontSize: 11 * u,
              transform: "translateX(-50%)",
            }}
          >
            ⟳
          </span>
        </div>
      </div>
    </div>
  );
}
