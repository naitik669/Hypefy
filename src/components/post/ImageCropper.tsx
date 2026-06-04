"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, Loader2 } from "lucide-react";

const OUT = 1080; // exported square size

/**
 * Square image cropper. Pan (drag / one finger), zoom (pinch / wheel / slider),
 * then exports a centred square crop as a JPEG blob via canvas.
 */
export function ImageCropper({
  src,
  onCancel,
  onDone,
}: {
  src: string;
  onCancel: () => void;
  onDone: (blob: Blob, url: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [D, setD] = useState(0);
  const [scale, setScale] = useState(1);
  const [t, setT] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  const drag = useRef<{ px: number; py: number; tx: number; ty: number } | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNat({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = src;
  }, [src]);

  useEffect(() => {
    if (frameRef.current) setD(frameRef.current.clientWidth);
  }, [nat]);

  const cover = nat && D ? D / Math.min(nat.w, nat.h) : 1;
  const dispScale = cover * scale;
  const dispW = nat ? nat.w * dispScale : 0;
  const dispH = nat ? nat.h * dispScale : 0;

  function clamp(x: number, y: number) {
    const maxX = Math.max(0, (dispW - D) / 2);
    const maxY = Math.max(0, (dispH - D) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }

  // Keep the image covering the frame whenever the zoom changes.
  useEffect(() => {
    setT((p) => clamp(p.x, p.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, D, nat]);

  function onPointerDown(e: React.PointerEvent) {
    if (pinch.current) return;
    drag.current = { px: e.clientX, py: e.clientY, tx: t.x, ty: t.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || pinch.current) return;
    setT(clamp(drag.current.tx + (e.clientX - drag.current.px), drag.current.ty + (e.clientY - drag.current.py)));
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
      setScale(Math.max(1, Math.min(4, pinch.current.scale * (d / pinch.current.dist))));
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinch.current = null;
  }
  function onWheel(e: React.WheelEvent) {
    setScale((s) => Math.max(1, Math.min(4, s * (e.deltaY < 0 ? 1.08 : 0.92))));
  }

  function done() {
    const img = imgRef.current;
    if (!img || !nat || busy) return;
    setBusy(true);
    const imgLeft = (D - dispW) / 2 + t.x;
    const imgTop = (D - dispH) / 2 + t.y;
    const sSize = D / dispScale;
    const sx = Math.max(0, Math.min(nat.w - sSize, -imgLeft / dispScale));
    const sy = Math.max(0, Math.min(nat.h - sSize, -imgTop / dispScale));

    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setBusy(false);
      return;
    }
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
    canvas.toBlob(
      (blob) => {
        if (blob) onDone(blob, URL.createObjectURL(blob));
        setBusy(false);
      },
      "image/jpeg",
      0.9,
    );
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 pt-12">
        <button type="button" onClick={onCancel} aria-label="Cancel" className="flex h-9 w-9 items-center justify-center text-white">
          <X size={24} />
        </button>
        <span className="text-base font-bold text-white">Crop</span>
        <button
          type="button"
          onClick={done}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-pill bg-accent px-4 py-2 text-sm font-bold text-accent-ink disabled:opacity-60"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          Done
        </button>
      </div>

      {/* Crop frame */}
      <div className="flex flex-1 items-center justify-center px-5">
        <div
          ref={frameRef}
          className="relative aspect-square w-full max-w-[min(88vw,420px)] select-none touch-none overflow-hidden rounded-2xl bg-[#0f0f0f]"
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
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none select-none"
              style={{
                left: (D - dispW) / 2,
                top: (D - dispH) / 2,
                width: dispW,
                height: dispH,
                transform: `translate(${t.x}px, ${t.y}px)`,
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

      {/* Zoom slider */}
      <div className="px-8 pb-12 pt-5">
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={scale}
          onChange={(e) => setScale(parseFloat(e.target.value))}
          aria-label="Zoom"
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-[var(--color-accent)]"
        />
        <p className="mt-3 text-center text-xs text-white/50">Drag to reposition · pinch or slide to zoom</p>
      </div>
    </div>,
    document.body,
  );
}
