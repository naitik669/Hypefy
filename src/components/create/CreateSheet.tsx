"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Film, Hourglass, Play } from "lucide-react";
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

const CARD_W = 150;

/**
 * A miniature of what the action produces, drawn in divs — a framed photo
 * with caption lines, a tall reel, a segmented story bar. Cheaper and
 * sharper than thumbnails, and it stays honest: nothing here pretends to
 * be the user's real content.
 */
function CardPreview({ kind, tint }: { kind: string; tint: string }) {
  const wash = `linear-gradient(160deg, rgba(${tint}, 0.32) 0%, rgba(${tint}, 0.06) 100%)`;

  if (kind === "post") {
    return (
      <div className="flex h-full w-full flex-col gap-1.5 p-3">
        <div className="w-full flex-1 rounded-lg" style={{ background: wash }} />
        <span className="h-1 w-full rounded-full bg-white/[0.13]" />
        <span className="h-1 w-2/3 rounded-full bg-white/[0.08]" />
      </div>
    );
  }

  if (kind === "shot") {
    return (
      <div className="flex h-full w-full items-center justify-center p-3">
        <div
          className="flex h-full w-[52px] items-center justify-center rounded-lg"
          style={{ background: wash }}
        >
          <Play size={15} strokeWidth={0} style={{ fill: `rgb(${tint})` }} className="translate-x-px" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-1.5 p-3">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-[3px] flex-1 rounded-full"
            style={{ background: i === 0 ? `rgb(${tint})` : `rgba(${tint}, 0.22)` }}
          />
        ))}
      </div>
      <div className="w-full flex-1 rounded-lg" style={{ background: wash }} />
    </div>
  );
}

/**
 * Create sheet — a horizontal drum, not a list of rows.
 *
 * The same interaction the date picker already uses (DateOfBirthPicker's
 * WheelColumn): whatever sits under the centre is the selection, so
 * scrolling and tapping are one gesture. Turned on its side because there
 * are only three options — a vertical drum would spend the sheet's whole
 * width on three stacked rows, which is what the old design did.
 *
 * Off-centre cards are desaturated rather than merely dimmed, so colour
 * itself marks the selection and only one card is ever in full colour.
 */
export function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const reelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const raf = useRef<number | null>(null);
  const [active, setActive] = useState(0);

  // Release the pending frame on unmount — the sheet unmounts its children
  // on close, so a queued callback would fire against a dead ref.
  useEffect(() => () => { if (raf.current !== null) cancelAnimationFrame(raf.current); }, []);

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
   *  from scrollLeft/stride so the gap and any future card size change can't
   *  silently drift the selection. */
  function onScroll() {
    if (raf.current !== null) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
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
    });
  }

  function go(href: string) {
    onClose();
    router.push(href);
  }

  /** Tapping the centred card opens it; tapping a side card brings it in.
   *  Keeps the old one-tap path intact for the default action instead of
   *  charging every user an extra confirm step for the carousel. */
  function onCardClick(i: number) {
    if (i === active) go(ACTIONS[i].href);
    else center(i);
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
      <div className="pb-4 pt-1">

        {/* ── Sheet header ─────────────────────────────────────── */}
        <div className="mb-3 flex items-center gap-2.5">
          <span
            className="h-[3px] w-5 rounded-full transition-colors duration-200"
            style={{ background: `rgb(${current.tint})` }}
          />
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Create</p>
        </div>

        {/* ── Drum ─────────────────────────────────────────────
            Negative margins cancel the sheet's px-5 so the reel runs edge
            to edge and cards can be seen leaving the frame. */}
        <div className="relative -mx-5">
          {/* Feathered edges, so the row reads as continuing past the sheet
              rather than being cut off. Matches the date picker's drum. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10"
            style={{ background: "linear-gradient(to right, var(--color-elevated), transparent)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10"
            style={{ background: "linear-gradient(to left, var(--color-elevated), transparent)" }}
          />

          <div
            ref={reelRef}
            onScroll={onScroll}
            onKeyDown={onKeyDown}
            tabIndex={0}
            role="group"
            aria-label="What do you want to create?"
            // Half-container minus half-card as padding is what lets the
            // first and last cards reach the centre — no measuring needed.
            className="no-scrollbar relative flex snap-x snap-mandatory gap-3 overflow-x-auto py-3 outline-none"
            style={{ paddingInline: `calc(50% - ${CARD_W / 2}px)` }}
          >
            {ACTIONS.map(({ key, icon: Icon, label, tint }, i) => {
              const on = i === active;
              return (
                <button
                  key={key}
                  ref={(el) => { cardRefs.current[i] = el; }}
                  type="button"
                  onClick={() => onCardClick(i)}
                  aria-current={on}
                  aria-label={on ? `${label} — open` : `${label} — select`}
                  style={{
                    width: CARD_W,
                    borderColor: on ? `rgba(${tint}, 0.45)` : "rgba(255, 255, 255, 0.06)",
                  }}
                  className={`flex aspect-[3/4] shrink-0 snap-center flex-col overflow-hidden rounded-2xl border bg-surface transition-all duration-200 ${
                    on ? "scale-100 opacity-100 grayscale-0" : "scale-[0.9] opacity-55 grayscale"
                  }`}
                >
                  <div className="min-h-0 flex-1">
                    <CardPreview kind={key} tint={tint} />
                  </div>
                  <div
                    className="flex items-center gap-1.5 border-t px-3 py-2.5"
                    style={{ borderColor: on ? `rgba(${tint}, 0.2)` : "rgba(255, 255, 255, 0.05)" }}
                  >
                    <Icon
                      size={13}
                      strokeWidth={1.9}
                      className="shrink-0"
                      style={{ color: on ? `rgb(${tint})` : undefined }}
                    />
                    <span className={`text-[12px] font-semibold ${on ? "text-foreground" : "text-muted"}`}>
                      {label}
                    </span>
                  </div>
                </button>
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

        {/* ── Caption + commit ─────────────────────────────────
            Keyed on the active card so the copy re-enters instead of
            swapping in place, which reads as the drum handing off. */}
        <p key={current.key} className="animate-row-in mt-3 text-center text-[13px] leading-relaxed text-muted">
          {current.desc}
        </p>

        <button
          type="button"
          onClick={() => go(current.href)}
          style={{ background: `rgb(${current.tint})` }}
          className="mt-4 h-12 w-full rounded-xl text-sm font-bold text-accent-ink transition active:scale-[0.99]"
        >
          {current.cta}
        </button>
      </div>
    </BottomSheet>
  );
}
