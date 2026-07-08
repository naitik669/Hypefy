"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, AlertCircle } from "lucide-react";

type ToastKind = "success" | "error" | "plain";
type ToastState = { id: number; kind: ToastKind; message: string } | null;

const ToastCtx = createContext<(message: string, kind?: ToastKind) => void>(() => {});

/** App-wide toast: `const toast = useToast(); toast("Saved", "success")`. */
export const useToast = () => useContext(ToastCtx);

const DURATION: Record<ToastKind, number> = { success: 2200, error: 3000, plain: 1800 };

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

  const show = useCallback((message: string, kind: ToastKind = "plain") => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setLeaving(false);
    setToast({ id: Date.now(), kind, message });
    timers.current.push(
      setTimeout(() => setLeaving(true), DURATION[kind]),
      setTimeout(() => { setToast(null); setLeaving(false); }, DURATION[kind] + 200),
    );
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {mounted && toast &&
        createPortal(
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
          </div>,
          document.body,
        )}
    </ToastCtx.Provider>
  );
}
