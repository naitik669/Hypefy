"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Centered modal dialog — the elevated cousin of BottomSheet for focused,
 * single-purpose moments (composing a note, setting a vibe). Blurred
 * backdrop, springy pop-in, tap outside or ✕ to dismiss.
 */
export function CenterModal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-5 backdrop-blur-[6px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="animate-modal-pop w-full max-w-[400px] overflow-hidden rounded-3xl border border-border bg-elevated shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          {title ? <h2 className="text-base font-bold">{title}</h2> : <span />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[78dvh] overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
