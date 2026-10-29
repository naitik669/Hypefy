"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Star, Users } from "lucide-react";

export type Audience = "mutual" | "close";

/**
 * One choice in the menu.
 *
 * `narrow` is what gets the accent treatment, rather than the picker
 * comparing the value to the literal "close". Shows' two values are
 * not Diary's, and a second copy of this menu to say the same thing in
 * different words is the kind of pair where the one nobody is looking
 * at drifts.
 */
export type AudienceOption<T extends string> = {
  value: T;
  label: string;
  hint: string;
  Icon: typeof Users;
  /** The smaller room: drawn in the accent colour. */
  narrow?: boolean;
};

const OPTIONS: readonly AudienceOption<Audience>[] = [
  { value: "mutual", label: "Mutuals", hint: "People you follow who follow you back", Icon: Users },
  { value: "close", label: "Close friends", hint: "Only the people on your close friends list", Icon: Star, narrow: true },
];

/**
 * Who can read your Diary, as a dropdown beside the Post button — the
 * choice is made once and rarely changed, so it takes one small button
 * rather than a full-width switch above the thing you actually came to do.
 *
 * Opens upwards: it lives at the foot of the composer, and on a phone the
 * keyboard is below that.
 */
export function AudiencePicker<T extends string = Audience>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  /** Defaults to Diary's two. Shows passes its own. */
  options?: readonly AudienceOption<T>[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const choices = (options ?? (OPTIONS as unknown as readonly AudienceOption<T>[]));
  const current = choices.find((o) => o.value === value) ?? choices[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Who can see it: ${current.label}`}
        className="flex h-12 items-center gap-2 rounded-2xl bg-white/[0.07] pl-3.5 pr-3 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.1]"
      >
        <current.Icon size={15} className={current.narrow ? "fill-accent text-accent" : "text-white/75"} />
        {current.label}
        <ChevronDown size={15} className={`text-white/45 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Who can see it"
          className="animate-menu-pop absolute bottom-full left-0 z-30 mb-2 w-[272px] origin-bottom-left rounded-2xl bg-elevated p-1.5 shadow-[0_22px_44px_-14px_rgb(0_0_0/0.85)]"
        >
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Who can see it</p>
          {choices.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={value === o.value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.07]">
                <o.Icon size={16} className={o.narrow ? "fill-accent text-accent" : "text-white/80"} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">{o.label}</span>
                <span className="block text-xs leading-snug text-muted">{o.hint}</span>
              </span>
              <Check size={16} className={value === o.value ? "text-accent" : "invisible"} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
