"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { useFocusTrap } from "@/lib/useFocusTrap";

/**
 * Hypefy's anchored popover — the one visual shell for every context menu
 * (post ⋯, feed switcher, chat header, message long-press). Renders inline
 * next to its anchor (caller controls position via className/style), with
 * an invisible full-screen backdrop, Escape-to-close, and the menu-pop
 * entrance. Compose rows with <MenuItem/> and <MenuDivider/>.
 */
export function FloatingMenu({
  open,
  onClose,
  className = "",
  style,
  origin = "top-right",
  notch = false,
  zIndex,
  exitMs,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Positioning classes, e.g. "absolute right-4 top-12 w-52" or "fixed …" */
  className?: string;
  style?: React.CSSProperties;
  origin?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  /** Small rotated square pointing at the anchor (post ⋯ menu style). */
  notch?: boolean;
  /** Override the stack level (menu at zIndex, click-catcher just below).
   *  Needed when the menu opens above another overlay (e.g. inside a sheet
   *  at z-200) — otherwise the catcher sits UNDER it and outside taps
   *  land on the overlay instead of closing the menu. */
  zIndex?: number;
  /** Milliseconds to keep the menu mounted after `open` flips false, so a
   *  closing animation can play. Opt-in: without it the menu unmounts
   *  immediately, which is the long-standing behaviour every other caller
   *  relies on. Must match the CSS duration of `animate-menu-pop-out`. */
  exitMs?: number;
  children: React.ReactNode;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  // Kept mounted through the exit animation when exitMs is set.
  const [leaving, setLeaving] = useState(false);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (!exitMs) return;
    if (wasOpen.current && !open) {
      setLeaving(true);
      const t = setTimeout(() => setLeaving(false), exitMs);
      wasOpen.current = open;
      return () => clearTimeout(t);
    }
    wasOpen.current = open;
    // Re-opening mid-exit must cancel the leaving state, or the fresh menu
    // would render with the out-animation still applied and vanish.
    if (open) setLeaving(false);
  }, [open, exitMs]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open && !leaving) return null;

  const originClass = {
    "top-right": "origin-top-right",
    "top-left": "origin-top-left",
    "bottom-right": "origin-bottom-right",
    "bottom-left": "origin-bottom-left",
  }[origin];

  return (
    <>
      {/* Invisible click-catcher — always one layer below the menu.
          Skipped while leaving so a dismissed menu can't keep swallowing taps
          during its exit animation. */}
      {open && (
        <div
          className="fixed inset-0 z-[190]"
          style={zIndex !== undefined ? { zIndex: zIndex - 1 } : undefined}
          onPointerDown={onClose}
        />
      )}

      <div
        ref={trapRef}
        role="menu"
        style={zIndex !== undefined ? { ...style, zIndex } : style}
        className={`${leaving ? "animate-menu-pop-out pointer-events-none" : "animate-menu-pop"} z-[200] overflow-hidden rounded-2xl border border-border bg-elevated/95 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl ${originClass} ${className}`}
      >
        {notch && (
          <div aria-hidden className="absolute -top-1.5 right-4 h-3 w-3 rotate-45 border-l border-t border-border bg-elevated" />
        )}
        <div className="flex flex-col py-1.5">{children}</div>
      </div>
    </>
  );
}

export function MenuItem({
  icon: Icon,
  label,
  sub,
  onClick,
  danger = false,
  active = false,
  pending = false,
  disabled = false,
}: {
  icon?: LucideIcon;
  label: string;
  sub?: string;
  onClick: () => void;
  danger?: boolean;
  /** Highlights the icon in accent (e.g. current selection). */
  active?: boolean;
  pending?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled || pending}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium transition-colors disabled:opacity-50 ${
        danger ? "text-danger hover:bg-danger/5" : "text-foreground hover:bg-white/5 active:bg-white/[0.08]"
      }`}
    >
      {pending ? (
        <Loader2 size={17} className="shrink-0 animate-spin text-muted" />
      ) : (
        Icon && <Icon size={17} className={`shrink-0 ${danger ? "" : active ? "text-accent" : "text-muted"}`} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {sub && <span className="block truncate text-xs font-normal text-muted">{sub}</span>}
      </span>
    </button>
  );
}

export function MenuDivider() {
  return <div className="mx-3 my-1 h-px bg-border" />;
}
