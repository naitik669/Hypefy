"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useOverlayBackButton } from "@/lib/overlay-stack";

/**
 * A profile photo, shown the way the app shows faces: a squircle, sized to
 * sit in the middle of the screen with the app blurred behind it.
 *
 * It used to open in ZoomViewer, the viewer built for post images — black to
 * the edges, the raw file at whatever size it was uploaded, pinch to zoom. A
 * face filling the screen edge to edge is not a preview of an avatar, it is
 * a photograph. This crops to the same square everything else draws, so what
 * you see is the avatar, bigger.
 */
export function AvatarPreview({
  src,
  name,
  handle,
  onClose,
}: {
  src: string;
  name: string;
  /** Shown under the photo when known, without the @. */
  handle?: string | null;
  onClose: () => void;
}) {
  useOverlayBackButton(true, onClose);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-background/70 px-8 backdrop-blur-2xl"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        className="absolute right-4 top-[calc(var(--sat)+12px)] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-foreground"
      >
        <X size={22} />
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${name}'s profile photo`}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        className="animate-rise aspect-square w-[min(74vw,320px)] select-none rounded-[26%] object-cover shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
      />

      <div className="text-center" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-bold">{name}</p>
        {handle && <p className="text-sm text-muted">@{handle}</p>}
      </div>
    </div>,
    document.body,
  );
}
