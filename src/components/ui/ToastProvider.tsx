"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, AlertCircle, Trash2 } from "lucide-react";
import { UNDO_MS } from "@/lib/undoable";

type ToastKind = "success" | "error" | "plain";
/** An offer attached to the toast — in practice, Undo. */
export type ToastAction = {
  label: string;
  onClick: () => void;
  /** What was deleted, under the message: "sunset run", "Chat with sana". */
  detail?: string;
  /** Its picture, so Undo plainly brings back that one. */
  thumb?: ToastThumb;
};
/** An image, or a letter on a colour when there is no image. */
export type ToastThumb = { src?: string | null; name?: string | null; hue?: number | null };
type ToastState = {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
} | null;

const ToastCtx = createContext<
  (message: string, kind?: ToastKind, action?: ToastAction) => void
>(() => {});

/** App-wide toast: `const toast = useToast(); toast("Saved", "success")`. */
export const useToast = () => useContext(ToastCtx);

const DURATION: Record<ToastKind, number> = { success: 2200, error: 3000, plain: 1800 };
/**
 * A toast carrying an action has to outlive the thing it is offering. Undo
 * holds a delete for UNDO_MS; if the toast left first the offer would still
 * be live with nothing on screen to take it.
 */
const ACTION_DURATION = UNDO_MS;

/**
 * Single bottom-center pill toast for action feedback ("Saved", "Couldn't
 * hype") — one at a time, newest wins. Message notifications stay with
 * InAppNotifier; this is purely the app talking back about your action.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const [leaving, setLeaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const show = useCallback(
    (message: string, kind: ToastKind = "plain", action?: ToastAction) => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setLeaving(false);
      setToast({ id: Date.now(), kind, message, action });
      const life = action ? ACTION_DURATION : DURATION[kind];
      timers.current.push(
        setTimeout(() => setLeaving(true), life),
        setTimeout(() => {
          setToast(null);
          setLeaving(false);
        }, life + 200)
      );
    },
    []
  );

  /** Dismiss immediately — the offer has been taken, so stop offering it. */
  const dismiss = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setLeaving(true);
    timers.current.push(
      setTimeout(() => {
        setToast(null);
        setLeaving(false);
      }, 200)
    );
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {mounted && toast &&
        createPortal(
          toast.action ? (
            // An offer to take something back: what went, its picture, Undo,
            // and a line along the bottom draining over the time left.
            <div className="pointer-events-none fixed inset-x-0 bottom-[84px] z-[215] flex justify-center px-3">
              <div
                key={toast.id}
                role="status"
                data-undo-toast=""
                className={`relative flex w-full max-w-[460px] items-center gap-2.5 overflow-hidden rounded-[18px] bg-elevated/[0.97] p-2 shadow-[0_12px_36px_rgba(0,0,0,0.5)] ring-1 ring-border backdrop-blur-xl transition-all duration-200 ${
                  leaving ? "translate-y-2 opacity-0" : "animate-toast-drop"
                }`}
              >
                <UndoThumb thumb={toast.action.thumb} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm font-bold">{toast.message}</span>
                  {toast.action.detail && (
                    <span className="mt-0.5 block truncate text-xs text-muted">{toast.action.detail}</span>
                  )}
                </span>
                <button
                  type="button"
                  // The container is pointer-events-none so a toast never
                  // eats a tap meant for the app. This one button opts back
                  // in — it is the only part anyone is meant to hit.
                  className="pointer-events-auto shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-extrabold text-accent-ink active:scale-95"
                  onClick={() => {
                    toast.action?.onClick();
                    dismiss();
                  }}
                >
                  {toast.action.label}
                </button>
                <span
                  aria-hidden
                  className="undo-drain absolute inset-x-0 bottom-0 h-[3px] origin-left bg-accent"
                  style={{ animationDuration: `${UNDO_MS}ms` }}
                />
              </div>
            </div>
          ) : (
            <div className="pointer-events-none fixed inset-x-0 bottom-[96px] z-[215] flex justify-center px-6">
              <div
                key={toast.id}
                role="status"
                className={`flex max-w-full items-center gap-2 rounded-pill bg-elevated/95 px-4 py-2.5 text-sm font-semibold shadow-[0_12px_36px_rgba(0,0,0,0.5)] ring-1 ring-border backdrop-blur-xl transition-all duration-200 ${
                  leaving ? "translate-y-2 opacity-0" : "animate-toast-drop"
                }`}
              >
                {toast.kind === "success" && <Check size={15} className="shrink-0 text-accent" />}
                {toast.kind === "error" && <AlertCircle size={15} className="shrink-0 text-danger" />}
                <span className="truncate">{toast.message}</span>
              </div>
            </div>
          ),
          document.body,
        )}
    </ToastCtx.Provider>
  );
}

/** The deleted thing's picture; a letter on its colour; or a bin. */
function UndoThumb({ thumb }: { thumb?: ToastThumb }) {
  if (thumb?.src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={thumb.src} alt="" className="h-9 w-9 shrink-0 rounded-[10px] bg-surface object-cover" />
    );
  }
  if (thumb?.name) {
    return (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-sm font-extrabold text-white"
        style={{ background: `hsl(${thumb.hue ?? 280} 55% 42%)` }}
      >
        {thumb.name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface text-muted">
      <Trash2 size={16} />
    </span>
  );
}
