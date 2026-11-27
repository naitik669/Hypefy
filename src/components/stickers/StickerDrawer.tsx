"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, MoreHorizontal, Plus, Star, User } from "lucide-react";
import type { Sticker } from "@hypefy/core/stickers";
import {
  FIRST_SHELF,
  SHELF_LABEL,
  emptyShelfText,
  railItems,
  sameShelf,
  settleShelf,
  type FixedShelf,
  type RailItem,
  type Shelf,
} from "@hypefy/core/sticker-rail";
import { checkPackName, packByline, packCover, type StickerPack } from "@hypefy/core/sticker-packs";
import { createClient } from "@/lib/supabase/client";
import {
  listFavouriteStickers,
  listMyStickers,
  listRecentStickers,
  setStickerFavourite,
} from "@/lib/sticker-store";
import {
  addToPack,
  deletePack,
  listMyPacks,
  markPackSeen,
  removeFromPack,
  renamePack,
  unsavePack,
} from "@/lib/sticker-pack-store";
import { GifPicker } from "@/components/messages/GifPicker";
import { StickerImage } from "@/components/stickers/StickerImage";
import { PackMaker } from "@/components/stickers/PackMaker";
import { openStickerStudio } from "@/lib/cutout/studio-href";

type Tab = "stickers" | "gifs";

/** The selected rail button: light grey behind it, never lime (Naitik, 27 Nov). */
export const RAIL_ON = "bg-white/[0.10] text-[#e4e4e4]";

/** How long a finger has to stay on a tile before it counts as a hold. */
const HOLD_MS = 450;

const SHELF_ICON: Record<FixedShelf, typeof Clock> = { recent: Clock, favourites: Star, yours: User };

type Menu =
  | { kind: "sticker"; sticker: Sticker; x: number; y: number; choosePack?: boolean }
  | { kind: "pack"; x: number; y: number };

type Dialog = { kind: "rename"; pack: StickerPack } | { kind: "delete"; pack: StickerPack } | null;

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
 * Rail order: Recent, Favourites, Yours, a cover per pack, then the dashed
 * plus that starts a new pack. A pack someone else made, newly added, has a
 * lime dot until it is opened.
 *
 * The first tile is Create, dark grey with a plus — not lime (Naitik, 27
 * Nov). In your own pack it is Add instead, and someone else's pack has
 * neither: you can't change a pack that isn't yours.
 *
 * Holding a tile (or right-clicking it) opens its menu: favourites, adding
 * it to one of your packs, and — in your own pack — moving it or taking it
 * out. Taking a sticker out of a pack never deletes it.
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
  const [packs, setPacks] = useState<StickerPack[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [maker, setMaker] = useState<{ addTo?: StickerPack } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      listMyStickers(supabase, currentUserId),
      listRecentStickers(supabase, currentUserId),
      listFavouriteStickers(supabase),
      listMyPacks(supabase),
    ]);
    // Said, not swallowed: an empty grid would read as "you have none".
    const bad = [a, b, c, d].find((r) => !r.ok);
    if (bad && !bad.ok) {
      setFailed(bad.error);
      return;
    }
    setFailed(null);
    if (a.ok) setMine(a.value);
    if (b.ok) setRecent(b.value);
    if (c.ok) setFavourites(c.value);
    if (d.ok) setPacks(d.value);
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

  const allPacks = packs ?? [];
  const current = settleShelf(shelf, allPacks);
  const pack = current.kind === "pack" ? allPacks.find((p) => p.id === current.packId) ?? null : null;
  const ownPacks = allPacks.filter((p) => p.mine);
  const shown =
    current.kind === "recent" ? recent
    : current.kind === "favourites" ? favourites
    : current.kind === "yours" ? mine
    : packs === null ? null
    : pack?.stickers ?? [];
  const items = railItems(allPacks.map((p) => ({ id: p.id, name: p.name })), true);
  const isFavourite = (id: string) => !!favourites?.some((f) => f.id === id);

  function pick(s: Shelf) {
    setShelf(s);
    setMenu(null);
    if (s.kind !== "pack") return;
    const p = allPacks.find((x) => x.id === s.packId);
    if (p?.fresh) {
      void markPackSeen(supabase, p.id);
      setPacks((prev) => (prev ?? []).map((x) => (x.id === p.id ? { ...x, fresh: false } : x)));
    }
  }

  /** Put the server's answer for one pack in place, or add it to the end. */
  function placePack(p: StickerPack) {
    setPacks((prev) => {
      const list = prev ?? [];
      return list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p];
    });
  }
  function dropPack(id: string) {
    setPacks((prev) => (prev ?? []).filter((x) => x.id !== id));
    setShelf(FIRST_SHELF);
  }

  function at(target: HTMLElement) {
    const box = boxRef.current?.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    if (!box) return { x: 8, y: 8 };
    // Under the thing, kept inside the drawer.
    return {
      x: Math.min(Math.max(8, r.left - box.left), Math.max(8, box.width - 228)),
      y: Math.min(r.bottom - box.top + 6, Math.max(8, box.height - 200)),
    };
  }

  function openMenu(sticker: Sticker, target: HTMLElement) {
    setMenuError(null);
    setMenu({ kind: "sticker", sticker, ...at(target) });
  }

  async function toggleFavourite(s: Sticker) {
    const want = !isFavourite(s.id);
    const res = await setStickerFavourite(supabase, s.id, want);
    if (!res.ok) return setMenuError(res.error);
    setFavourites((prev) => {
      const rest = (prev ?? []).filter((f) => f.id !== s.id);
      return res.value ? [s, ...rest] : rest;
    });
    setMenu(null);
  }

  async function putIn(target: StickerPack, s: Sticker) {
    const res = await addToPack(supabase, target.id, [s.id]);
    if (!res.ok) return setMenuError(res.error);
    placePack(res.value);
    // "Move": out of the pack it was held in, once it is safely in the other.
    if (pack?.mine && pack.id !== target.id) {
      const out = await removeFromPack(supabase, pack.id, s.id);
      if (!out.ok) return setMenuError(`It's in ${target.name} now, but ${out.error}`);
      placePack(out.value);
    }
    setMenu(null);
  }

  async function takeOut(s: Sticker) {
    if (!pack) return;
    const res = await removeFromPack(supabase, pack.id, s.id);
    if (!res.ok) return setMenuError(res.error);
    placePack(res.value);
    setMenu(null);
  }

  async function removePack(p: StickerPack) {
    const res = await unsavePack(supabase, p.id);
    if (!res.ok) return setMenuError(res.error);
    setMenu(null);
    dropPack(p.id);
  }

  const label = current.kind === "pack" ? "" : SHELF_LABEL[current.kind];
  const lead = current.kind !== "pack" ? "create" : pack?.mine ? "add" : null;

  const rail = (vertical: boolean) => (
    <Rail
      items={items}
      shelf={current}
      packs={allPacks}
      vertical={vertical}
      onPick={pick}
      onNew={() => { setMenu(null); setMaker({}); }}
    />
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

            {pack ? (
              <div className="flex shrink-0 items-center gap-2.5 px-4 pb-2.5 pt-1 sm:pt-3.5" data-pack-header>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="truncate text-[14.5px] font-extrabold">{pack.name}</b>
                  <span className="text-[11.5px] font-semibold text-muted">{packByline(pack)}</span>
                </span>
                <button
                  type="button"
                  aria-label="Pack options"
                  aria-haspopup="menu"
                  onClick={(e) => { setMenuError(null); setMenu({ kind: "pack", ...at(e.currentTarget) }); }}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-xl bg-surface text-muted hover:text-foreground"
                >
                  <MoreHorizontal size={17} />
                </button>
              </div>
            ) : (
              <p className="shrink-0 px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted sm:pt-3.5">
                {label}
                {shown && shown.length > 0 ? ` · ${shown.length}` : ""}
              </p>
            )}

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
                  {lead === "create" && (
                    /* Create: always first, dark grey with a plus. */
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
                  )}
                  {lead === "add" && pack && (
                    /* Add: your own pack only. The same picker, minus what is in it. */
                    <button
                      type="button"
                      onClick={() => setMaker({ addTo: pack })}
                      aria-label="Add stickers to this pack"
                      className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-[#3a3a3a] text-[10.5px] font-extrabold text-[#a3e635] transition hover:bg-white/[0.03] active:scale-95"
                    >
                      <Plus size={18} />
                      Add
                    </button>
                  )}
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
                <p className="px-2 pt-4 text-center text-xs text-faint">{emptyShelfText(current)}</p>
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
            className="absolute z-20 max-h-[260px] w-[220px] overflow-y-auto rounded-2xl bg-surface p-1 shadow-xl ring-1 ring-border"
            style={{ left: menu.x, top: menu.y }}
          >
            {menu.kind === "sticker" && !menu.choosePack && (
              <>
                <MenuItem onClick={() => void toggleFavourite(menu.sticker)}>
                  {isFavourite(menu.sticker.id) ? "Remove from favourites" : "Add to favourites"}
                </MenuItem>
                {ownPacks.some((p) => p.id !== pack?.id) && (
                  <MenuItem onClick={() => setMenu({ ...menu, choosePack: true })}>
                    {pack?.mine ? "Move to another pack" : "Add to a pack"}
                  </MenuItem>
                )}
                {pack?.mine && (
                  <MenuItem danger onClick={() => void takeOut(menu.sticker)}>Take out of this pack</MenuItem>
                )}
              </>
            )}
            {menu.kind === "sticker" && menu.choosePack &&
              ownPacks
                .filter((p) => p.id !== pack?.id)
                .map((p) => (
                  <MenuItem key={p.id} onClick={() => void putIn(p, menu.sticker)}>
                    {p.name}
                  </MenuItem>
                ))}
            {menu.kind === "pack" && pack && (pack.mine ? (
              <>
                <MenuItem onClick={() => { setMenu(null); setDialog({ kind: "rename", pack }); }}>Rename</MenuItem>
                <MenuItem danger onClick={() => { setMenu(null); setDialog({ kind: "delete", pack }); }}>Delete pack</MenuItem>
              </>
            ) : (
              <MenuItem danger onClick={() => void removePack(pack)}>Remove pack</MenuItem>
            ))}
            {menuError && <p role="alert" className="px-3 pb-2 text-[11.5px] text-danger">{menuError}</p>}
          </div>
        </>
      )}

      {dialog && (
        <PackDialog
          dialog={dialog}
          onCancel={() => setDialog(null)}
          onRename={async (name) => {
            const res = await renamePack(supabase, dialog.pack.id, name);
            if (!res.ok) return res.error;
            placePack(res.value);
            setDialog(null);
            return null;
          }}
          onDelete={async () => {
            const res = await deletePack(supabase, dialog.pack.id);
            if (!res.ok) return res.error;
            dropPack(dialog.pack.id);
            setDialog(null);
            return null;
          }}
        />
      )}

      {maker && (
        <PackMaker
          currentUserId={currentUserId}
          yours={mine ?? []}
          favourites={favourites ?? []}
          packs={allPacks}
          addTo={maker.addTo}
          onMade={(p) => { placePack(p); setShelf({ kind: "pack", packId: p.id }); }}
          onClose={() => setMaker(null)}
        />
      )}
    </div>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold hover:bg-white/5 ${danger ? "text-danger" : "text-foreground"}`}
    >
      {children}
    </button>
  );
}

/** Rename and delete, inside the drawer. Each answers with an error to show, or null. */
function PackDialog({
  dialog,
  onCancel,
  onRename,
  onDelete,
}: {
  dialog: NonNullable<Dialog>;
  onCancel: () => void;
  onRename: (name: string) => Promise<string | null>;
  onDelete: () => Promise<string | null>;
}) {
  const [name, setName] = useState(dialog.pack.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setError(null);
    let err: string | null;
    if (dialog.kind === "rename") {
      const n = checkPackName(name);
      if (!n.ok) return setError(n.error);
      setBusy(true);
      err = await onRename(n.name);
    } else {
      setBusy(true);
      err = await onDelete();
    }
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-4">
      <div role="dialog" aria-modal="true" aria-label={dialog.kind === "rename" ? "Rename pack" : "Delete pack"} className="w-full max-w-[320px] rounded-2xl bg-surface p-4 ring-1 ring-border">
        {dialog.kind === "rename" ? (
          <>
            <label htmlFor="pack-rename" className="text-[13px] font-extrabold">Rename pack</label>
            <input
              id="pack-rename"
              value={name}
              maxLength={40}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              className="mt-2.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-[14px] text-foreground outline-none focus:border-white/25"
            />
          </>
        ) : (
          <>
            <p className="text-[13px] font-extrabold">Delete {dialog.pack.name}?</p>
            <p className="mt-1.5 text-[12px] leading-snug text-muted">It leaves everyone&apos;s drawer, including people who added it. The stickers in it stay.</p>
          </>
        )}
        {error && <p role="alert" className="mt-2 text-[12px] text-danger">{error}</p>}
        <div className="mt-3.5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-9 rounded-xl px-3.5 text-[13px] font-bold text-muted hover:text-foreground">Cancel</button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void go()}
            className={`h-9 rounded-xl px-3.5 text-[13px] font-extrabold disabled:opacity-40 ${dialog.kind === "delete" ? "bg-danger text-white" : "bg-foreground text-background"}`}
          >
            {dialog.kind === "rename" ? "Save" : "Delete"}
          </button>
        </div>
      </div>
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
 * (Naitik, 27 Nov, overriding the drawn lime square). Lime is left for the
 * new-pack dot only.
 */
function Rail({
  items,
  shelf,
  packs,
  vertical,
  onPick,
  onNew,
}: {
  items: RailItem[];
  shelf: Shelf;
  packs: readonly StickerPack[];
  vertical: boolean;
  onPick: (s: Shelf) => void;
  onNew: () => void;
}) {
  const size = vertical ? "h-[42px] w-[42px]" : "h-10 w-10";
  const img = vertical ? 30 : 28;
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
        if (it.kind === "new") {
          return (
            <button
              key="new"
              type="button"
              aria-label={it.label}
              title={it.label}
              onClick={onNew}
              className={`flex ${size} shrink-0 items-center justify-center rounded-[13px] border-[1.5px] border-dashed border-[#3a3a3a] text-[#8a8a8a] transition hover:text-foreground`}
            >
              <Plus size={18} strokeWidth={2.2} aria-hidden />
            </button>
          );
        }
        const target: Shelf = it.kind === "shelf" ? { kind: it.shelf } : { kind: "pack", packId: it.packId };
        const on = sameShelf(shelf, target);
        const p = it.kind === "pack" ? packs.find((x) => x.id === it.packId) : undefined;
        const front = p ? packCover(p.stickers, p.coverStickerId, 1)[0] : undefined;
        const Icon = it.kind === "shelf" ? SHELF_ICON[it.shelf] : null;
        return (
          <button
            key={it.kind === "shelf" ? it.shelf : it.packId}
            type="button"
            aria-label={it.label}
            aria-pressed={on}
            title={it.label}
            onClick={() => onPick(target)}
            className={`relative flex ${size} shrink-0 items-center justify-center rounded-[13px] transition ${
              on ? RAIL_ON : `${p ? "bg-[#1a1a1a]" : vertical ? "" : "bg-surface"} text-muted hover:text-foreground`
            }`}
          >
            {Icon ? (
              <Icon size={18} strokeWidth={2.2} aria-hidden />
            ) : front ? (
              <StickerImage sticker={front} box={{ width: img, height: img }} />
            ) : (
              <span aria-hidden className="text-[13px] font-extrabold">{it.label.slice(0, 1)}</span>
            )}
            {p?.fresh && <span data-fresh aria-label="New" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#a3e635] ring-2 ring-elevated" />}
          </button>
        );
      })}
    </nav>
  );
}
