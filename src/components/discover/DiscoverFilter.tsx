"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  Cpu,
  GameController,
  Hash,
  Lightning,
  MusicNotes,
  PaintBrush,
  SlidersHorizontal,
  Smiley,
  Sparkle,
  TrendUp,
  Users,
  type Icon,
} from "@phosphor-icons/react";
import { FloatingMenu } from "@/components/ui/FloatingMenu";

/**
 * What Discover is showing, chosen from a list that drops out of the button
 * beside the search bar.
 *
 * Two groups, because they are two different questions. "Browse" is how to
 * look — the ranked feed, what is trending, only Shots, people, tags — and
 * "Topics" is what to look at.
 *
 * Quiet on purpose. It first shipped with lime tiles behind every icon, a lime
 * wash on the button and a glow on every dot, which is three ways of shouting
 * about a menu. Selection is now said once, by a radio on the right; the row
 * you are on is lifted a shade, and everything else is monochrome.
 */

export const BROWSE: { id: string; icon: Icon }[] = [
  { id: "For You", icon: Sparkle },
  { id: "Blowing Up", icon: TrendUp },
  // The tab bar's own mark for a Shot, so the two never disagree.
  { id: "Shots", icon: Lightning },
  { id: "People", icon: Users },
  { id: "Tags", icon: Hash },
];

/** Discover's topics (see CATEGORY_DEFS on the page), each with its own mark. */
const TOPIC_ICONS: Record<string, Icon> = {
  Technology: Cpu,
  Gaming: GameController,
  "Art & Design": PaintBrush,
  Photography: Camera,
  Music: MusicNotes,
  Memes: Smiley,
};

/**
 * The one colour in the menu: a calm green for "this one", in place of the
 * brand lime, which at dot size and with a glow read as neon.
 */
const ON = "#34C759";

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
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border bg-surface transition-colors ${
          open ? "border-white/25 text-foreground" : "border-border text-muted"
        }`}
      >
        <SlidersHorizontal size={19} weight="regular" />
        {filtered && (
          // Ringed in the button's own colour so it sits on the corner
          // cleanly instead of floating over the border.
          <span
            aria-hidden
            className="absolute right-[7px] top-[7px] h-2 w-2 rounded-full ring-2 ring-surface"
            style={{ backgroundColor: ON }}
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
            className="fixed w-[236px] !rounded-[20px]"
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
                    Glyph={b.icon}
                    on={value === b.id}
                    onClick={() => pick(b.id)}
                  />
                ))}
              </Group>

              {topics.length > 0 && (
                <>
                  <div aria-hidden className="mx-2.5 my-1.5 h-px bg-border/70" />
                  <Group title="Topics">
                    {topics.map((t) => (
                      <Row
                        key={t}
                        label={t}
                        Glyph={TOPIC_ICONS[t] ?? Hash}
                        on={value === t}
                        onClick={() => pick(t)}
                      />
                    ))}
                  </Group>
                </>
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
    <div role="group" aria-label={title} className="pt-1">
      <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold tracking-wide text-faint">
        {title}
      </p>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Row({
  label,
  Glyph,
  on,
  onClick,
}: {
  label: string;
  Glyph: Icon;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={on}
      onClick={onClick}
      className={`flex h-10 w-full items-center gap-3 rounded-xl px-2.5 text-left text-[14px] transition-colors ${
        on
          ? "bg-white/[0.06] font-medium text-foreground"
          : "text-foreground/80 hover:bg-white/[0.03] active:bg-white/[0.05]"
      }`}
    >
      <Glyph
        size={18}
        weight={on ? "fill" : "regular"}
        className={`shrink-0 ${on ? "text-foreground" : "text-muted"}`}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {/* A radio: an empty ring, or the same ring with a dot in it. */}
      <span
        aria-hidden
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors"
        style={{ borderColor: on ? ON : "rgba(255,255,255,0.22)" }}
      >
        {on && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ON }} />}
      </span>
    </button>
  );
}
