"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Search, X } from "lucide-react";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import { haptics } from "@/lib/haptics";
import { EMOJI_GROUPS, recentEmoji, rememberEmoji, searchEmoji } from "@/lib/emoji";

const WIDTH = 344;
const HEIGHT = 380;
const MARGIN = 12;

/**
 * Emoji, in a popup beside the button that opened it: search at the
 * top, what you used last first, then the rest in groups with a tab for
 * each along the foot.
 *
 * It stays open as you pick, so you can add a few; tap outside, press
 * Escape or Back to close it. Opened only by a tap, so it is never drawn on
 * the server and can read your recents straight away.
 */
export function EmojiPicker({
  open,
  anchor,
  onPick,
  onClose,
}: {
  open: boolean;
  /** The button it opens from; the popup sits above it, or below if there is no room. */
  anchor: HTMLElement | null;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(<Panel anchor={anchor} onPick={onPick} onClose={onClose} />, document.body);
}

/** The least height worth opening at before trying the other side. */
const MIN_HEIGHT = 290;

/**
 * Below the button when there is room — the page you are writing sits above
 * it, and you want to watch the emoji land — else above; shorter rather than
 * off the screen.
 */
function place(anchor: HTMLElement | null) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(WIDTH, vw - MARGIN * 2);
  const r = anchor?.getBoundingClientRect();
  if (!r) {
    const height = Math.min(HEIGHT, vh - MARGIN * 2);
    return { left: (vw - width) / 2, top: (vh - height) / 2, width, height };
  }
  const left = Math.min(Math.max(MARGIN, r.right - width), vw - width - MARGIN);
  const below = vh - r.bottom - 8 - MARGIN;
  const above = r.top - 8 - MARGIN;
  if (below >= MIN_HEIGHT || below >= above) {
    return { left, top: r.bottom + 8, width, height: Math.min(HEIGHT, below) };
  }
  const height = Math.min(HEIGHT, above);
  return { left, top: r.top - 8 - height, width, height };
}

function Panel({ anchor, onPick, onClose }: { anchor: HTMLElement | null; onPick: (e: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  // Recents as they were when it opened: a row that reshuffles under your
  // finger as you pick would move the next one you were reaching for.
  const [recent] = useState(() => recentEmoji.get());
  // Placed once, as it opens: by the button, inside the screen.
  const [at] = useState(() => place(anchor));
  const [tab, setTab] = useState(recent.length ? "recent" : EMOJI_GROUPS[0].key);
  const scroller = useRef<HTMLDivElement>(null);

  useOverlayBackButton(true, onClose);

  // Escape closes this, and only this — not the sheet or modal it opened over.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  function pick(e: string) {
    haptics.select();
    rememberEmoji(e);
    onPick(e);
  }

  function jump(key: string) {
    setTab(key);
    const el = scroller.current?.querySelector<HTMLElement>(`[data-group="${key}"]`);
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 4, behavior: "smooth" });
  }

  /** The tab follows the group you have scrolled to. */
  function onScroll() {
    const box = scroller.current;
    if (!box) return;
    let current = tab;
    for (const el of box.querySelectorAll<HTMLElement>("[data-group]")) {
      if (el.offsetTop - box.scrollTop <= 24) current = el.dataset.group!;
    }
    if (current !== tab) setTab(current);
  }

  const found = q.trim() ? searchEmoji(q) : null;
  const grid = (list: string[]) => (
    <div className="grid grid-cols-8">
      {list.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => pick(e)}
          aria-label={e}
          className="flex aspect-square items-center justify-center rounded-xl text-[26px] leading-none transition-transform hover:bg-white/[0.07] active:scale-[0.8]"
        >
          {e}
        </button>
      ))}
    </div>
  );

  return (
    <div
      // Events stop here: this is portalled out of a modal, a sheet or a card
      // deck, and React would otherwise carry a tap inside it up to that
      // overlay's backdrop — or a scroll through the emoji up to the deck,
      // as a swipe.
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div aria-hidden className="fixed inset-0 z-[250]" onPointerDown={onClose} />
      <div
        role="dialog"
        aria-label="Emoji"
        className="animate-rise fixed z-[251] flex flex-col overflow-hidden rounded-[26px] bg-elevated shadow-[0_24px_60px_-12px_rgb(0_0_0/0.85)] ring-1 ring-border"
        style={{ left: at.left, top: at.top, width: at.width, height: at.height }}
      >
        <div className="flex items-center gap-2 p-2.5 pb-1.5">
          <label className="flex h-10 flex-1 items-center gap-2 rounded-2xl bg-background/70 px-3 ring-1 ring-border focus-within:ring-accent/60">
            <Search size={16} className="shrink-0 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search emoji"
              aria-label="Search emoji"
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="text-muted">
                <X size={15} />
              </button>
            )}
          </label>
        </div>

        <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {found ? (
            found.length ? (
              grid(found)
            ) : (
              <p className="px-3 py-10 text-center text-sm text-muted">No emoji for “{q.trim()}”</p>
            )
          ) : (
            <>
              {recent.length > 0 && (
                <section data-group="recent">
                  <h3 className="px-1.5 pb-1 pt-1.5 text-[11px] font-bold text-muted">Recent</h3>
                  {grid(recent)}
                </section>
              )}
              {EMOJI_GROUPS.map((g) => (
                <section key={g.key} data-group={g.key}>
                  <h3 className="px-1.5 pb-1 pt-2.5 text-[11px] font-bold text-muted">{g.label}</h3>
                  {grid(g.emoji.map(([e]) => e))}
                </section>
              ))}
            </>
          )}
        </div>

        {!found && (
          <nav aria-label="Emoji groups" className="flex items-center justify-between border-t border-border/70 px-1.5 py-1">
            {recent.length > 0 && (
              <button
                type="button"
                onClick={() => jump("recent")}
                aria-label="Recent"
                aria-current={tab === "recent"}
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${tab === "recent" ? "bg-white/10 text-foreground" : "text-muted"}`}
              >
                <Clock size={16} />
              </button>
            )}
            {EMOJI_GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => jump(g.key)}
                aria-label={g.label}
                aria-current={tab === g.key}
                className={`flex h-8 w-8 items-center justify-center rounded-xl text-lg transition-[background-color,filter] ${
                  tab === g.key ? "bg-white/10" : "grayscale-[0.7] opacity-70"
                }`}
              >
                {g.icon}
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
