"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { CenterModal } from "@/components/ui/CenterModal";

/**
 * The one confirmation dialog: destructive actions get a beat of friction
 * with the same crafted shell as every other Hypefy modal. `onConfirm` may
 * be async — the confirm button shows its own pending state.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  icon: Icon = AlertTriangle,
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  icon?: LucideIcon;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <CenterModal open={open} onClose={busy ? () => {} : onClose}>
      <div className="flex flex-col items-center gap-3 pb-1 pt-2 text-center">
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
            danger ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent"
          }`}
        >
          <Icon size={22} />
        </span>
        <div>
          <h3 className="text-[17px] font-extrabold leading-tight tracking-tight">
            {title}
            <span className="text-accent">.</span>
          </h3>
          <p className="mx-auto mt-1.5 max-w-[260px] text-sm leading-snug text-muted">{body}</p>
        </div>

        <div className="mt-2 flex w-full gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold text-foreground transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-transform active:scale-[0.98] disabled:opacity-60 ${
              danger ? "bg-danger text-white" : "bg-accent text-accent-ink"
            }`}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : confirmLabel}
          </button>
        </div>
      </div>
    </CenterModal>
  );
}
