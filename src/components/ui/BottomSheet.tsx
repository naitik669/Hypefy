"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Slide-up bottom sheet rendered via createPortal at document.body.
 * This avoids stacking context issues — the sheet always overlays
 * everything regardless of where in the component tree it lives.
 */
export function BottomSheet({
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

  // Escape closes the sheet, matching CenterModal/FloatingMenu behavior.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 backdrop-blur-[6px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="animate-rise w-full max-w-[480px] max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-elevated pb-[calc(env(safe-area-inset-bottom)+12px)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-elevated/95 px-5 pb-2 pt-3 backdrop-blur-sm">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
          {title && (
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-white/5"
              >
                <X size={18} />
              </button>
            </div>
          )}
        </div>
        <div className="px-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
