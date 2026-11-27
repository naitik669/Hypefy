"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Plus, Star, User } from "lucide-react";
import type { Sticker } from "@hypefy/core/stickers";
import {
  FIRST_SHELF,
  SHELF_LABEL,
  emptyShelfText,
  railItems,
  sameShelf,
  type FixedShelf,
  type RailItem,
  type Shelf,
} from "@hypefy/core/sticker-rail";
import { createClient } from "@/lib/supabase/client";
import {
  listFavouriteStickers,
  listMyStickers,
  listRecentStickers,
  setStickerFavourite,
} from "@/lib/sticker-store";
import { GifPicker } from "@/components/messages/GifPicker";
import { StickerImage } from "@/components/stickers/StickerImage";
import { openStickerStudio } from "@/lib/cutout/studio-href";

type Tab = "stickers" | "gifs";

/** The selected rail button: light grey behind it, never lime (Naitik, 27 Nov). */
export const RAIL_ON = "bg-white/[0.14] text-foreground";

/** How long a finger has to stay on a tile before it counts as a hold. */
const HOLD_MS = 450;

const SHELF_ICON: Record<FixedShelf, typeof Clock> = { recent: Clock, favourites: Star, yours: User };

/**
 * The Stickers & GIFs drawer (D1 C + D6 C, with the rail from "Packs & the
 * drawer rail", 27 Nov).
 *
 * One button in the composer opens it, always on Stickers · Recent; GIFs
 * are its second tab rather than a second button. The groups are a rail:
 * down the left on desktop, and on the phone a row of icons with no words
 * in the place the chips used to be — Naitik's screenshot, 27 Nov. The rail
 * is sticker groups only, so it is not drawn on the GIFs tab.
 *
 * The first tile is always Create, in dark grey with a plus — not lime
 * (Naitik, 27 Nov) — so making a sticker is as close as sending one.
 *
 * Holding a tile (or right-clicking it) opens its menu: for now, add to or
 * take out of your favourites.
 */
export function StickerDrawer({
  currentUserId,
  conversationId,
  startTab = "stickers",
  onSticker,
  onGif,
}: {
  currentUserId: string;
  /** Where Create's finished sticker is sent. */
  conversationId: string;
  /** Open on this tab. The sticker button leaves it out and gets Stickers. */
  startTab?: Tab;
  /** Send this sticker. */
  onSticker: (s: Sticker) => void;
  /** Send this GIF. */
  onGif: (url: string) => void;
}) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>(startTab);
  const [shelf, setShelf] = useState<Shelf>(FIRST_SHELF);
  const [mine, setMine] = useState<Sticker[] | null>(null);
  const [recent, setRecent] = useState<Sticker[] | null>(null);
  const [favourites, setFavourites] = useState<Sticker[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ sticker: Sticker; x: number; y: number } | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      listMyStickers(supabase, currentUserId),
      listRecentStickers(supabase, currentUserId),
      listFavouriteStickers(supabase),
    ]);
    // Said, not swallowed: an empty grid would read as "you have none".
    const bad = [a, b, c].find((r) => !r.ok);
    if (bad && !bad.ok) {
      setFailed(bad.error);
      return;
    }
    setFailed(null);
    if (a.ok) setMine(a.value);
    if (b.ok) setRecent(b.value);
    if (c.ok) setFavourites(c.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the client is recreated each render; the user is what matters
  }, [currentUserId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set after the reads answer
    void load();
  }, [load]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);

  const shown = shelf.kind === "recent" ? recent : shelf.kind === "favourites" ? favourites : shelf.kind === "yours" ? mine : [];
  const label = shelf.kind === "pack" ? "" : SHELF_LABEL[shelf.kind];
  const items = railItems([], false);
  const isFavourite = (id: string) => !!favourites?.some((f) => f.id === id);

  function openMenu(sticker: Sticker, target: HTMLElement) {
    const box = boxRef.current?.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    if (!box) return;
    setMenuError(null);
    // Under the tile, kept inside the drawer.
    const x = Math.min(Math.max(8, r.left - box.left), Math.max(8, box.width - 208));
    const y = Math.min(r.bottom - box.top + 6, Math.max(8, box.height - 64));
    setMenu({ sticker, x, y });
  }

  async function toggleFavourite(s: Sticker) {
    const want = !isFavourite(s.id);
    const res = await setStickerFavourite(supabase, s.id, want);
    if (!res.ok) {
      setMenuError(res.error);
      return;
    }
    setFavourites((prev) => {
      const rest = (prev ?? []).filter((f) => f.id !== s.id);
      return res.value ? [s, ...rest] : rest;
    });
    setMenu(null);
  }

  const rail = (vertical: boolean) => (
    <Rail items={items} shelf={shelf} vertical={vertical} onPick={(s) => { setShelf(s); setMenu(null); }} />
  );

  return (
    <div
      ref={boxRef}
      className="relative flex h-[380px] overflow-hidden rounded-2xl border border-border bg-elevated shadow-2xl"
    >
      {/* Desktop: the rail down the left. */}
      {tab === "stickers" && <div className="hidden sm:flex">{rail(true)}</div>}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Stickers | GIFs */}
        <div role="tablist" aria-label="Stickers and GIFs" className="mx-3 mt-3 flex shrink-0 gap-0.5 rounded-[14px] bg-surface p-[3px] sm:w-[240px]">
          {(["stickers", "gifs"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => { setTab(t); setMenu(null); }}
              className={`h-[30px] flex-1 rounded-[11px] text-xs font-semibold transition ${
                tab === t ? "bg-elevated text-foreground shadow-[0_1px_0_rgba(255,255,255,0.06),0_2px_6px_rgba(0,0,0,0.35)]" : "text-muted hover:text-foreground"
              }`}
            >
              {t === "stickers" ? "Stickers" : "GIFs"}
            </button>
          ))}
        </div>

        {tab === "gifs" ? (
          <div className="min-h-0 flex-1 pt-2">
            <GifPicker embedded onSelect={onGif} />
          </div>
        ) : (
          <>
            {/* Phone: the same icons, in a row where the chips were. */}
            <div className="sm:hidden">{rail(false)}</div>

            <p className="shrink-0 px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted sm:pt-3.5">
              {label}
              {shown && shown.length > 0 ? ` · ${shown.length}` : ""}
            </p>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {failed ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <p className="text-sm text-muted">Couldn&apos;t load your stickers.</p>
                  <button type="button" onClick={() => void load()} className="text-xs font-bold text-accent">
                    Try again
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
                  {/* Create: always first, dark grey with a plus. */}
                  <button
                    type="button"
                    onClick={() => openStickerStudio(conversationId)}
                    aria-label="Create a sticker"
                    className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-[14px] border border-[#2f2f2f] bg-[#242424] text-[11.5px] font-extrabold text-[#d8d8d8] transition hover:bg-[#2a2a2a] active:scale-95"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#333] text-[#eaeaea]">
                      <Plus size={16} />
                    </span>
                    Create
                  </button>
                  {shown === null
                    ? Array.from({ length: 3 }, (_, i) => (
                        <span key={i} className="aspect-square animate-pulse rounded-[14px] bg-white/[0.025]" />
                      ))
                    : shown.map((s) => (
                        <StickerTile key={s.id} sticker={s} onSend={() => onSticker(s)} onHold={(el) => openMenu(s, el)} />
                      ))}
                </div>
              )}
              {!failed && shown !== null && shown.length === 0 && (
                <p className="px-2 pt-4 text-center text-xs text-faint">{emptyShelfText(shelf)}</p>
              )}
            </div>
          </>
        )}
      </div>

      {menu && (
        <>
          <button type="button" aria-label="Close menu" className="absolute inset-0 z-10 cursor-default" onClick={() => setMenu(null)} />
          <div
            role="menu"
            className="absolute z-20 w-[200px] overflow-hidden rounded-2xl bg-surface p-1 shadow-xl ring-1 ring-border"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => void toggleFavourite(menu.sticker)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-foreground hover:bg-white/5"
            >
              <Star size={16} aria-hidden />
              {isFavourite(menu.sticker.id) ? "Remove from favourites" : "Add to favourites"}
            </button>
            {menuError && <p className="px-3 pb-2 text-[11.5px] text-danger">{menuError}</p>}
          </div>
        </>
      )}
    </div>
  );
}

/** One sticker in the grid: tap sends it, hold or right-click opens its menu. */
function StickerTile({ sticker, onSend, onHold }: { sticker: Sticker; onSend: () => void; onHold: (el: HTMLElement) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const ref = useRef<HTMLButtonElement>(null);

  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  function hold() {
    cancel();
    held.current = true;
    if (ref.current) onHold(ref.current);
  }

  return (
    <button
      ref={ref}
      type="button"
      aria-label="Send sticker"
      aria-haspopup="menu"
      onPointerDown={(e) => {
        held.current = false;
        if (e.pointerType === "mouse") return; // a mouse holds with the right button instead
        cancel();
        timer.current = setTimeout(hold, HOLD_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      // Android also fires contextmenu on a long press; whichever comes
      // first opens the menu and the other finds it already open.
      onContextMenu={(e) => { e.preventDefault(); if (!held.current) hold(); }}
      onClick={() => {
        if (held.current) { held.current = false; return; }
        onSend();
      }}
      className="flex aspect-square select-none items-center justify-center rounded-[14px] bg-white/[0.03] p-1.5 transition [-webkit-touch-callout:none] hover:bg-white/[0.06] active:scale-95"
    >
      <StickerImage sticker={sticker} box={{ width: 72, height: 72 }} />
    </button>
  );
}

/**
 * The rail. Vertical: a 62px column with 42px buttons. Horizontal: 40px
 * buttons in a row. The selected one sits on light grey — not lime
 * (Naitik, 27 Nov, overriding the drawn lime square).
 */
function Rail({
  items,
  shelf,
  vertical,
  onPick,
}: {
  items: RailItem[];
  shelf: Shelf;
  vertical: boolean;
  onPick: (s: Shelf) => void;
}) {
  const size = vertical ? "h-[42px] w-[42px]" : "h-10 w-10";
  return (
    <nav
      aria-label="Sticker groups"
      className={
        vertical
          ? "no-scrollbar flex h-full w-[62px] shrink-0 flex-col items-center gap-[7px] overflow-y-auto border-r border-border py-3"
          : "no-scrollbar flex shrink-0 items-center gap-[7px] overflow-x-auto px-3.5 pb-2.5 pt-3"
      }
    >
      {items.map((it, i) => {
        if (it.kind === "sep") {
          return <span key={`sep-${i}`} aria-hidden className={vertical ? "my-[3px] h-px w-[26px] shrink-0 bg-white/10" : "mx-0.5 h-6 w-px shrink-0 bg-white/10"} />;
        }
        if (it.kind === "new") return null; // packs arrive with the next part
        const target: Shelf = it.kind === "shelf" ? { kind: it.shelf } : { kind: "pack", packId: it.packId };
        const on = sameShelf(shelf, target);
        const Icon = it.kind === "shelf" ? SHELF_ICON[it.shelf] : Star;
        return (
          <button
            key={it.kind === "shelf" ? it.shelf : it.packId}
            type="button"
            aria-label={it.label}
            aria-pressed={on}
            title={it.label}
            onClick={() => onPick(target)}
            className={`flex ${size} shrink-0 items-center justify-center rounded-[13px] transition ${
              on ? RAIL_ON : `${vertical ? "" : "bg-surface"} text-muted hover:text-foreground`
            }`}
          >
            <Icon size={18} strokeWidth={2.2} aria-hidden />
          </button>
        );
      })}
    </nav>
  );
}
