"use client";

import { useCallback, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ImageIcon, Film, Hourglass, Play, Star, MessageCircle,
  Send, Bookmark, MoreHorizontal, Plus,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";

/**
 * Each action owns a tint, written as a bare "r, g, b" triple so it can be
 * composed into rgba() at several opacities without three tokens per colour.
 *
 * Lime is the brand and stays on the primary action. The other two are
 * deliberately desaturated neighbours rather than the app's existing
 * verified-blue and hype-gold, which carry meaning elsewhere (verification,
 * Hype counts) and would misread here.
 */
const ACTIONS = [
  {
    key: "post",
    icon: ImageIcon,
    label: "Post",
    desc: "Share a photo and your thoughts",
    cta: "Start a post",
    href: "/create/post",
    tint: "163, 230, 53",
  },
  {
    key: "shot",
    icon: Film,
    label: "Shot",
    desc: "Short video reel for the Shots feed",
    cta: "Record a Shot",
    href: "/create/shot",
    tint: "167, 139, 250",
  },
  {
    key: "show",
    icon: Hourglass,
    label: "Show",
    desc: "A moment that disappears in 24 hours",
    cta: "Add to your Show",
    href: "/shows/add",
    tint: "251, 146, 60",
  },
] as const;

/**
 * Card geometry lives in CSS, not JS.
 *
 * Sizing off the viewport is what lets the card be genuinely large on a
 * phone and still sane on a tablet, and expressing the reel's side padding
 * as `50% - var(--card-w)/2` is what centres the first and last cards
 * without measuring anything. A JS constant could not do either.
 */
const CARD_VARS = {
  "--card-w": "min(70vw, 310px)",
  "--card-h": "min(52vh, 440px)",
} as React.CSSProperties;

/**
 * A miniature of the thing you are about to make — a post card with its
 * author row and Hype rail, a reel with its side actions, a Show with its
 * segment bar. Drawn in divs rather than screenshots, so it never goes
 * stale against the real UI and never pretends to be the user's content.
 */
function CardPreview({ kind, tint }: { kind: string; tint: string }) {
  const wash = `linear-gradient(160deg, rgba(${tint}, 0.34) 0%, rgba(${tint}, 0.07) 100%)`;
  const lit = { color: `rgb(${tint})`, fill: `rgb(${tint})` };

  if (kind === "post") {
    return (
      <div className="flex h-full w-full flex-col gap-2.5 p-3.5">
        {/* author row */}
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 shrink-0 rounded-full" style={{ background: `rgba(${tint}, 0.38)` }} />
          <span className="min-w-0 flex-1">
            <span className="block h-1.5 w-16 rounded-full bg-white/25" />
            <span className="mt-1.5 block h-1 w-10 rounded-full bg-white/12" />
          </span>
          <MoreHorizontal size={13} className="shrink-0 text-white/25" />
        </div>

        {/* the photo */}
        <div className="w-full flex-1 rounded-xl" style={{ background: wash }} />

        {/* hype rail */}
        <div className="flex items-center gap-3">
          <Star size={14} style={lit} />
          <MessageCircle size={14} className="text-white/35" />
          <Send size={14} className="text-white/35" />
          <span className="flex-1" />
          <Bookmark size={14} className="text-white/35" />
        </div>

        {/* caption */}
        <div className="space-y-1.5">
          <span className="block h-1 w-full rounded-full bg-white/14" />
          <span className="block h-1 w-2/3 rounded-full bg-white/9" />
        </div>
      </div>
    );
  }

  if (kind === "shot") {
    return (
      <div className="h-full w-full p-3">
        <div className="relative h-full w-full overflow-hidden rounded-xl" style={{ background: wash }}>
          <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/35">
            <Play size={17} strokeWidth={0} style={{ fill: `rgb(${tint})` }} className="translate-x-px" />
          </span>

          {/* the vertical action rail Shots actually have */}
          <div className="absolute bottom-3.5 right-2.5 flex flex-col items-center gap-3">
            <Star size={14} style={lit} />
            <MessageCircle size={14} className="text-white/45" />
            <Send size={14} className="text-white/45" />
          </div>

          <div className="absolute inset-x-3.5 bottom-3.5 right-11 space-y-1.5">
            <span className="block h-1.5 w-14 rounded-full bg-white/32" />
            <span className="block h-1 w-20 rounded-full bg-white/16" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full p-3">
      <div className="relative h-full w-full overflow-hidden rounded-xl" style={{ background: wash }}>
        {/* 24h segments — the one element that says "this expires" */}
        <div className="absolute inset-x-2.5 top-2.5 flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-[3px] flex-1 rounded-full"
              style={{ background: i === 0 ? `rgb(${tint})` : "rgba(255, 255, 255, 0.2)" }}
            />
          ))}
        </div>

        <div className="absolute inset-x-2.5 top-6 flex items-center gap-2">
          <span className="h-6 w-6 rounded-full" style={{ background: `rgba(${tint}, 0.42)` }} />
          <span className="h-1.5 w-12 rounded-full bg-white/28" />
        </div>

        <div className="absolute inset-x-3 bottom-3 flex h-8 items-center rounded-full border border-white/15 px-3">
          <span className="h-1 w-16 rounded-full bg-white/18" />
        </div>
      </div>
    </div>
  );
}

/**
 * Create sheet — a peeking carousel, not a list of rows.
 *
 * Whatever sits under the centre is the selection, so scrolling and tapping
 * are one gesture — the same model the date picker's drum already uses.
 * Turned on its side and sized to fill the sheet because three options with
 * real previews earn the space; the old stacked rows spent the full width
 * on three lines of text.
 *
 * Off-centre cards are desaturated rather than merely dimmed, so colour
 * itself marks the selection and only one card is ever in full colour.
 */
export function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const reelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);

  const center = useCallback((i: number) => {
    const el = reelRef.current;
    const card = cardRefs.current[i];
    if (!el || !card) return;
    el.scrollTo({
      left: card.offsetLeft + card.offsetWidth / 2 - el.clientWidth / 2,
      behavior: "smooth",
    });
  }, []);

  /** Nearest card to the viewport centre wins. Measured rather than derived
   *  from scrollLeft/stride, because the card width is a viewport expression
   *  and JS has no constant to divide by.
   *
   *  Deliberately not deferred through requestAnimationFrame: scroll events
   *  are already frame-paced, there are only three cards to compare, and an
   *  rAF hop silently stops running whenever the tab is hidden. */
  function onScroll() {
    const el = reelRef.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    cardRefs.current.forEach((c, i) => {
      if (!c) return;
      const dist = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    setActive((prev) => (prev === best ? prev : best));
  }

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = Math.max(0, Math.min(ACTIONS.length - 1, active + (e.key === "ArrowRight" ? 1 : -1)));
    center(next);
  }

  const current = ACTIONS[active];

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="pb-3 pt-0.5">

        {/* ── Sheet header ─────────────────────────────────────── */}
        <div className="mb-2 flex items-center gap-2.5">
          <span
            className="h-[3px] w-5 rounded-full transition-colors duration-200"
            style={{ background: `rgb(${current.tint})` }}
          />
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Create</p>
        </div>

        {/* ── Carousel ─────────────────────────────────────────
            Negative margins cancel the sheet's px-5 so the reel runs edge
            to edge and the neighbouring cards peek in from both sides. */}
        <div className="relative -mx-5">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8"
            style={{ background: "linear-gradient(to right, var(--color-elevated), transparent)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8"
            style={{ background: "linear-gradient(to left, var(--color-elevated), transparent)" }}
          />

          <div
            ref={reelRef}
            onScroll={onScroll}
            onKeyDown={onKeyDown}
            tabIndex={0}
            role="group"
            aria-label="What do you want to create?"
            className="no-scrollbar relative flex snap-x snap-mandatory gap-3 overflow-x-auto py-3 outline-none"
            style={{ ...CARD_VARS, paddingInline: "calc(50% - var(--card-w) / 2)" }}
          >
            {/* The card is a div, not a button: the add control lives inside
                it, and a button nested in a button is invalid and swallows
                its own clicks. Each card still exposes exactly one button —
                add when centred, select when not. */}
            {ACTIONS.map(({ key, icon: Icon, label, desc, cta, href, tint }, i) => {
              const on = i === active;
              return (
                <div
                  key={key}
                  ref={(el) => { cardRefs.current[i] = el; }}
                  aria-current={on}
                  style={{
                    width: "var(--card-w)",
                    height: "var(--card-h)",
                    borderColor: on ? `rgba(${tint}, 0.45)` : "rgba(255, 255, 255, 0.06)",
                  }}
                  className={`relative flex shrink-0 snap-center flex-col overflow-hidden rounded-[20px] border bg-surface transition-all duration-200 ${
                    on ? "scale-100 opacity-100 grayscale-0" : "scale-[0.92] opacity-50 grayscale"
                  }`}
                >
                  <div className="relative min-h-0 flex-1">
                    <CardPreview kind={key} tint={tint} />

                    {/* The control says what it does. A bare + floating on an
                        abstract preview is a shape, not an instruction. The
                        caption is inside the button so the whole stack is one
                        target, rather than a label sitting beside a control
                        that ignores taps on it. */}
                    {on && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => go(href)}
                          className="animate-modal-pop group/add flex flex-col items-center gap-2.5 outline-none"
                        >
                          <span
                            style={{ background: `rgb(${tint})` }}
                            // ring in the card's own surface colour rather than
                            // a shadow — separates the control from the artwork
                            // behind it without reintroducing a glow.
                            className="flex h-14 w-14 items-center justify-center rounded-full text-accent-ink ring-4 ring-surface transition group-active/add:scale-95"
                          >
                            <Plus size={26} strokeWidth={2.5} />
                          </span>
                          <span className="rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white">
                            {cta}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Every card states what it is. "Shot" and "Show" are
                      Hypefy's own words — a one-word label tells a new user
                      nothing, so the description rides on the card instead of
                      sitting under the carousel where it only ever described
                      whichever card was already selected. */}
                  <div
                    className="border-t px-4 py-3.5"
                    style={{ borderColor: on ? `rgba(${tint}, 0.2)` : "rgba(255, 255, 255, 0.05)" }}
                  >
                    <div className="flex items-center gap-2">
                      <Icon
                        size={15}
                        strokeWidth={2}
                        className="shrink-0"
                        style={{ color: on ? `rgb(${tint})` : undefined }}
                      />
                      <h3 className={`text-[17px] font-bold leading-none tracking-tight ${on ? "text-foreground" : "text-muted"}`}>
                        {label}
                      </h3>
                    </div>
                    <p className="mt-1.5 text-[11.5px] leading-snug text-muted">{desc}</p>
                  </div>

                  {/* Off-centre cards stay tappable to bring them in. Last in
                      the stack so it covers the whole card. */}
                  {!on && (
                    <button
                      type="button"
                      onClick={() => center(i)}
                      aria-label={`${label} — select`}
                      className="absolute inset-0"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Position rail ────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-1.5">
          {ACTIONS.map((a, i) => (
            <span
              key={a.key}
              aria-hidden
              className={`h-1.5 rounded-full transition-all duration-200 ${i === active ? "w-5" : "w-1.5 bg-border"}`}
              style={i === active ? { background: `rgb(${current.tint})` } : undefined}
            />
          ))}
        </div>

      </div>
    </BottomSheet>
  );
}
