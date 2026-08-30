"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useOverlayBackButton } from "@/lib/overlay-stack";

/**
 * Full-screen image viewer. Pinch to zoom (mobile), wheel to zoom (desktop),
 * drag to pan when zoomed, double-tap to toggle zoom.
 */
export function ZoomViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [t, setT] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; tx: number; ty: number } | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const moved = useRef(false);

  // Rendered only while open, so being mounted *is* being open.
  useOverlayBackButton(true, onClose);

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function fingerDist(a: React.Touch, b: React.Touch) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (pinch.current) return;
    moved.current = false;
    drag.current = { px: e.clientX, py: e.clientY, tx: t.x, ty: t.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || pinch.current || scale <= 1) return;
    moved.current = true;
    setT({ x: drag.current.tx + (e.clientX - drag.current.px), y: drag.current.ty + (e.clientY - drag.current.py) });
  }
  function onPointerUp() {
    drag.current = null;
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinch.current = { dist: fingerDist(e.touches[0], e.touches[1]), scale };
      drag.current = null;
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinch.current) {
      moved.current = true;
      const d = fingerDist(e.touches[0], e.touches[1]);
      setScale(Math.max(1, Math.min(5, pinch.current.scale * (d / pinch.current.dist))));
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) {
      pinch.current = null;
      if (scale <= 1.02) {
        setScale(1);
        setT({ x: 0, y: 0 });
      }
    }
  }
  function onWheel(e: React.WheelEvent) {
    setScale((s) => {
      const ns = Math.max(1, Math.min(5, s * (e.deltaY < 0 ? 1.12 : 0.9)));
      if (ns <= 1) setT({ x: 0, y: 0 });
      return ns;
    });
  }
  function onDoubleClick() {
    setScale((s) => (s > 1 ? 1 : 2.5));
    setT({ x: 0, y: 0 });
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      onClick={() => {
        // Tap the backdrop (not after a drag) to close when not zoomed.
        if (scale <= 1 && !moved.current) onClose();
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        className="absolute right-4 top-12 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm"
      >
        <X size={22} />
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-[100vw] select-none object-contain"
        style={{
          transform: `translate(${t.x}px, ${t.y}px) scale(${scale})`,
          transition: drag.current || pinch.current ? "none" : "transform 0.2s ease-out",
        }}
      />
    </div>,
    document.body,
  );
}
