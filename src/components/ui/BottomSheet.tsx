"use client";

import { X } from "lucide-react";

/** Reusable slide-up bottom sheet, constrained to the app column width. */
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
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 mx-auto flex max-w-[480px] items-end bg-black/60"
      onClick={onClose}
    >
      <div
        className="animate-rise max-h-[80dvh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-elevated pb-[calc(env(safe-area-inset-bottom)+12px)]"
        onClick={(e) => e.stopPropagation()}
      >
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
    </div>
  );
}
