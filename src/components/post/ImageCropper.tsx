"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Check,
  Loader2,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  RotateCw,
} from "lucide-react";

const OUT = 1080; // exported width

/**
 * Image editor + cropper. Pan (drag), zoom (pinch / wheel / slider), rotate in
 * quarter turns, mirror / flip, and adjust hue + saturation, then exports a
 * centred crop as a JPEG blob.
 *
 * Rotation is baked into the working image rather than applied as a CSS
 * transform, so a quarter turn simply swaps `nat` and every measurement that
 * depends on it — cover, clamp, export — keeps working untouched.
 * `aspect` = width / height (1 = square avatar, 3 = wide banner, …).
 */
export function ImageCropper({
  src,
  aspect = 1,
  label = "Edit",
  onCancel,
  onDone,
}: {
  src: string;
  aspect?: number;
  label?: string;
  onCancel: () => void;
  onDone: (blob: Blob, url: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const baseImgRef = useRef<HTMLImageElement | null>(null); // original
  // Flipped/rotated version used for export. A canvas, not an Image, so it
  // is ready the instant the transform is applied — decoding a data URL
  // asynchronously left Done able to export the PREVIOUS orientation.
  const workImgRef = useRef<HTMLImageElement | HTMLCanvasElement | null>(null);
  // `baseNat` is the file as it came in; `nat` is the working image after
  // rotation, which swaps width and height on a quarter turn. Everything
  // downstream — cover, clamp, export — measures against `nat`.
  const [baseNat, setBaseNat] = useState<{ w: number; h: number } | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [workSrc, setWorkSrc] = useState(src);
  const [D, setD] = useState(0);
  const [scale, setScale] = useState(1);
  const [t, setT] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  // Editing controls
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [quarter, setQuarter] = useState(0); // 90° turns, 0–3
  const [hue, setHue] = useState(0); // degrees 0–360
  const [sat, setSat] = useState(100); // percent 0–200

  const drag = useRef<{
    px: number;
    py: number;
    tx: number;
    ty: number;
  } | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);

  const filterCss = `saturate(${sat}%) hue-rotate(${hue}deg)`;

  // Load the original image.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      baseImgRef.current = img;
      workImgRef.current = img;
      setBaseNat({ w: img.naturalWidth, h: img.naturalHeight });
      setNat({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = src;
  }, [src]);

  // Re-derive the working image whenever mirror or rotation changes.
  useEffect(() => {
    const base = baseImgRef.current;
    if (!base || !baseNat) return;

    if (!flipH && !flipV && quarter === 0) {
      workImgRef.current = base;
      setWorkSrc(src);
      setNat(baseNat);
      return;
    }

    // A quarter turn swaps the canvas dimensions; a half turn does not.
    const swap = quarter % 2 === 1;
    const c = document.createElement("canvas");
    c.width = swap ? baseNat.h : baseNat.w;
    c.height = swap ? baseNat.w : baseNat.h;
    const cx = c.getContext("2d");
    if (!cx) return;
    cx.translate(c.width / 2, c.height / 2);
    cx.rotate((quarter * Math.PI) / 2);
    cx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    cx.drawImage(base, -baseNat.w / 2, -baseNat.h / 2);

    // Assign the canvas itself before anything async, so Done can never
    // export a stale orientation.
    workImgRef.current = c;
    setNat({ w: c.width, h: c.height });
    setWorkSrc(c.toDataURL("image/png"));
  }, [flipH, flipV, quarter, baseNat, src]);

  useEffect(() => {
    if (frameRef.current) setD(frameRef.current.clientWidth);
  }, [nat]);

  const Dh = D / aspect; // frame height
  const cover = nat && D ? Math.max(D / nat.w, Dh / nat.h) : 1;
  const dispScale = cover * scale;
  const dispW = nat ? nat.w * dispScale : 0;
  const dispH = nat ? nat.h * dispScale : 0;

  function clamp(x: number, y: number) {
    const maxX = Math.max(0, (dispW - D) / 2);
    const maxY = Math.max(0, (dispH - Dh) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }

  useEffect(() => {
    setT((p) => clamp(p.x, p.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, D, nat]);

  // A turn changes what is under the frame; recentre rather than leaving
  // the crop clinging to an edge that has moved.
  useEffect(() => {
    setT({ x: 0, y: 0 });
  }, [quarter]);

  function onPointerDown(e: React.PointerEvent) {
    if (pinch.current) return;
    drag.current = { px: e.clientX, py: e.clientY, tx: t.x, ty: t.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || pinch.current) return;
    setT(
      clamp(
        drag.current.tx + (e.clientX - drag.current.px),
        drag.current.ty + (e.clientY - drag.current.py)
      )
    );
  }
  function onPointerUp() {
    drag.current = null;
  }

  function fingerDist(a: React.Touch, b: React.Touch) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinch.current = { dist: fingerDist(e.touches[0], e.touches[1]), scale };
      drag.current = null;
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinch.current) {
      const d = fingerDist(e.touches[0], e.touches[1]);
      setScale(
        Math.max(1, Math.min(4, pinch.current.scale * (d / pinch.current.dist)))
      );
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinch.current = null;
  }
  function onWheel(e: React.WheelEvent) {
    setScale((s) => Math.max(1, Math.min(4, s * (e.deltaY < 0 ? 1.08 : 0.92))));
  }

  function resetEdits() {
    setFlipH(false);
    setFlipV(false);
    setQuarter(0);
    setHue(0);
    setSat(100);
    setScale(1);
    setT({ x: 0, y: 0 });
  }

  function done() {
    const img = workImgRef.current ?? baseImgRef.current;
    if (!img || !nat || busy) return;
    setBusy(true);
    const imgLeft = (D - dispW) / 2 + t.x;
    const imgTop = (Dh - dispH) / 2 + t.y;
    const sW = D / dispScale;
    const sH = Dh / dispScale;
    const sx = Math.max(0, Math.min(nat.w - sW, -imgLeft / dispScale));
    const sy = Math.max(0, Math.min(nat.h - sH, -imgTop / dispScale));

    const outW = OUT;
    const outH = Math.round(OUT / aspect);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setBusy(false);
      return;
    }
    // Apply colour adjustments at export time (matches the live preview).
    if (hue !== 0 || sat !== 100) ctx.filter = filterCss;
    ctx.drawImage(img, sx, sy, sW, sH, 0, 0, outW, outH);
    canvas.toBlob(
      (blob) => {
        if (blob) onDone(blob, URL.createObjectURL(blob));
        setBusy(false);
      },
      "image/jpeg",
      0.9
    );
  }

  if (typeof document === "undefined") return null;

  const edited =
    flipH || flipV || quarter !== 0 || hue !== 0 || sat !== 100 || scale !== 1;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 pt-12">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="flex h-9 w-9 items-center justify-center text-white"
        >
          <X size={24} />
        </button>
        <span className="text-base font-bold text-white">{label}</span>
        <button
          type="button"
          onClick={done}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-pill bg-accent px-4 py-2 text-sm font-bold text-accent-ink disabled:opacity-60"
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Check size={16} />
          )}
          Done
        </button>
      </div>

      {/* Crop frame */}
      <div className="flex flex-1 items-center justify-center px-5">
        <div
          ref={frameRef}
          style={{ aspectRatio: String(aspect) }}
          className="relative w-full max-w-[min(88vw,420px)] select-none touch-none overflow-hidden rounded-2xl bg-[#0f0f0f]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onWheel={onWheel}
        >
          {nat && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={workSrc}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none select-none"
              style={{
                left: (D - dispW) / 2,
                top: (Dh - dispH) / 2,
                width: dispW,
                height: dispH,
                transform: `translate(${t.x}px, ${t.y}px)`,
                filter: filterCss,
              }}
            />
          )}
          {/* Rule-of-thirds grid */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/15" />
            ))}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="px-6 pb-10 pt-4">
        {/* Tool buttons */}
        <div className="mb-4 flex items-center justify-center gap-2.5">
          <ToolButton
            active={quarter !== 0}
            onClick={() => setQuarter((q) => (q + 1) % 4)}
            label="Rotate"
          >
            <RotateCw size={18} />
          </ToolButton>
          <ToolButton
            active={flipH}
            onClick={() => setFlipH((v) => !v)}
            label="Mirror"
          >
            <FlipHorizontal2 size={18} />
          </ToolButton>
          <ToolButton
            active={flipV}
            onClick={() => setFlipV((v) => !v)}
            label="Flip"
          >
            <FlipVertical2 size={18} />
          </ToolButton>
          <ToolButton
            active={false}
            onClick={resetEdits}
            label="Reset"
            disabled={!edited}
          >
            <RotateCcw size={18} />
          </ToolButton>
        </div>

        {/* Sliders */}
        <div className="mx-auto flex max-w-sm flex-col gap-3">
          <Slider
            label="Zoom"
            min={1}
            max={4}
            step={0.01}
            value={scale}
            onChange={setScale}
          />
          <Slider
            label="Hue"
            min={0}
            max={360}
            step={1}
            value={hue}
            onChange={setHue}
            suffix="°"
          />
          <Slider
            label="Saturation"
            min={0}
            max={200}
            step={1}
            value={sat}
            onChange={setSat}
            suffix="%"
          />
        </div>
        <p className="mt-3 text-center text-xs text-white/45">
          Drag to reposition · pinch or scroll to zoom
        </p>
      </div>
    </div>,
    document.body
  );
}

function ToolButton({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 rounded-2xl px-4 py-2 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
        active ? "bg-accent text-accent-ink" : "bg-white/10 text-white"
      }`}
    >
      {children}
      {label}
    </button>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  suffix = "",
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] font-medium text-white/55">
        <span>{label}</span>
        <span>
          {label === "Zoom"
            ? `${value.toFixed(1)}x`
            : `${Math.round(value)}${suffix}`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={label}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-[var(--color-accent)]"
      />
    </div>
  );
}
