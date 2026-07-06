"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { haptics } from "@/lib/haptics";

export type FeedTab = "foryou" | "following" | "favourite" | "hypers";

const OPTIONS: { value: FeedTab; label: string }[] = [
  { value: "foryou", label: "For You" },
  { value: "following", label: "Following" },
  { value: "hypers", label: "Hypers" },
];

/** Reads the active feed tab from the URL (?feed=), defaulting to "foryou". */
export function useFeedTab(): FeedTab {
  const params = useSearchParams();
  const raw = params.get("feed");
  return (OPTIONS.some((o) => o.value === raw) ? raw : "foryou") as FeedTab;
}

/**
 * Wordmark + tiny chevron that opens a small anchored menu for switching
 * the home feed's tab. Selecting an option updates the `?feed=` URL param;
 * FeedList reads the same param via useFeedTab so the two stay in sync
 * without any shared client state.
 */
export function FeedTabDropdown() {
  const router = useRouter();
  const active = useFeedTab();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  function select(tab: FeedTab) {
    haptics.tap();
    setOpen(false);
    router.replace(tab === "foryou" ? "/home" : `/home?feed=${tab}`, { scroll: false });
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch feed"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-full px-1.5 py-1 transition-colors active:scale-95"
      >
        <span className="text-xl font-extrabold tracking-tight">
          Hypefy<span className="text-accent">.</span>
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-2xl border border-border bg-elevated py-1 shadow-2xl">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => select(o.value)}
              className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/5 ${
                active === o.value ? "font-bold text-foreground" : "text-muted"
              }`}
            >
              {o.label}
              {active === o.value && <Check size={15} className="text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
