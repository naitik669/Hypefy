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
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
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
        <div className="flex items-start justify-between px-5 pb-2 pt-4">
          {title ? (
            <div className="min-w-0">
              {/* Title carries the wordmark's lime full stop — the one brand tell */}
              <h2 className="text-[17px] font-extrabold leading-tight tracking-tight">
                {title}
                <span className="text-accent">.</span>
              </h2>
              {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
            </div>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground"
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
