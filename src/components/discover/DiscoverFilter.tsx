"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Flame,
  Hash,
  Play,
  SlidersHorizontal,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { FloatingMenu } from "@/components/ui/FloatingMenu";

/**
 * What Discover is showing, chosen from a list that drops out of the button
 * beside the search bar.
 *
 * Two groups, because they are two different questions. "Browse" is how to
 * look — the ranked feed, what is blowing up, only Shots, people, tags — and
 * "Topics" is what to look at. As one flat row of chips the difference was
 * invisible: "Shots" and "Football" sat side by side as if they were the same
 * kind of thing.
 *
 * Each row carries a dot, empty until it is the one you are on. The button
 * gets the same dot while anything but For You is chosen, so a filtered
 * Discover says so without a label squeezing the search bar.
 */

export const BROWSE: { id: string; icon: LucideIcon }[] = [
  { id: "For You", icon: Sparkles },
  { id: "Blowing Up", icon: Flame },
  { id: "Shots", icon: Play },
  { id: "People", icon: Users },
  { id: "Tags", icon: Hash },
];

export function DiscoverFilter({
  value,
  topics,
  onChange,
}: {
  value: string;
  topics: string[];
  onChange: (next: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  /**
   * Where the list hangs, measured from the button when it opens.
   *
   * Portalled rather than drawn in place: the bar this button sits in is
   * sticky and, on a desktop, frosted — a backdrop filter makes it the
   * containing block for anything fixed inside it, so the list and the
   * catch-all behind it that closes it would both have been confined to the
   * bar's own strip of the screen.
   */
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const filtered = value !== "For You";

  useLayoutEffect(() => {
    if (!open) return;
    const box = buttonRef.current?.getBoundingClientRect();
    if (!box) return;
    setAnchor({ top: box.bottom + 8, right: Math.max(8, window.innerWidth - box.right) });
  }, [open]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={filtered ? `Filter: ${value}` : "Filter"}
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors ${
          open || filtered
            ? "border-accent/40 bg-accent/10 text-foreground"
            : "border-border bg-surface text-muted"
        }`}
      >
        <SlidersHorizontal size={18} />
        {filtered && (
          <span
            aria-hidden
            className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgba(163,230,53,0.7)]"
          />
        )}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <FloatingMenu
            open
            onClose={() => setOpen(false)}
            origin="top-right"
            zIndex={220}
            className="fixed w-[248px] !rounded-[22px]"
            style={{
              top: anchor?.top ?? 0,
              right: anchor?.right ?? 16,
              opacity: anchor ? 1 : 0,
            }}
          >
            <div className="max-h-[62vh] overflow-y-auto overscroll-contain px-1.5 pb-1">
              <Group title="Browse">
                {BROWSE.map((b) => (
                  <Row
                    key={b.id}
                    label={b.id}
                    icon={<b.icon size={15} />}
                    on={value === b.id}
                    onClick={() => pick(b.id)}
                  />
                ))}
              </Group>

              {topics.length > 0 && (
                <Group title="Topics">
                  {topics.map((t) => (
                    <Row
                      key={t}
                      label={t}
                      // The topic's own initial: ten identical glyphs down a
                      // list tell you nothing, and a letter is something the
                      // eye can find again next time.
                      icon={<span className="text-[13px] font-extrabold">{t.charAt(0)}</span>}
                      on={value === t}
                      onClick={() => pick(t)}
                    />
                  ))}
                </Group>
              )}
            </div>
          </FloatingMenu>,
          document.body,
        )}
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={title} className="pt-2 first:pt-1">
      <p className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
        {title}
      </p>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Row({
  label,
  icon,
  on,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={on}
      onClick={onClick}
      className={`flex h-11 w-full items-center gap-3 rounded-[14px] px-2.5 text-left text-sm transition-colors active:scale-[0.99] ${
        on ? "bg-white/[0.05] font-semibold text-foreground" : "text-foreground/85 hover:bg-white/[0.03]"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition-colors ${
          on ? "bg-accent/15 text-accent" : "bg-surface text-muted"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {/* Empty until it is the one you are on, then filled green. */}
      <span
        aria-hidden
        className={`h-2.5 w-2.5 shrink-0 rounded-full transition-all ${
          on
            ? "bg-accent shadow-[0_0_8px_rgba(163,230,53,0.7)]"
            : "border border-white/20"
        }`}
      />
    </button>
  );
}
