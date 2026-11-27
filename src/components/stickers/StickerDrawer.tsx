"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Plus } from "lucide-react";
import type { Sticker } from "@hypefy/core/stickers";
import { createClient } from "@/lib/supabase/client";
import { listMyStickers, listRecentStickers } from "@/lib/sticker-store";
import { GifPicker } from "@/components/messages/GifPicker";
import { StickerImage } from "@/components/stickers/StickerImage";
import { openStickerStudio } from "@/lib/cutout/studio-href";

type Tab = "stickers" | "gifs";
type Shelf = "recent" | "yours";

const TAB_KEY = "hypefy:sticker-drawer:tab";

function readTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === "gifs" ? "gifs" : "stickers";
  } catch {
    return "stickers";
  }
}

/**
 * The Stickers & GIFs drawer (D1 C + D6 C).
 *
 * One button in the composer opens it; GIFs are its second tab rather than a
 * second button. The first tile is always Create, in dark grey with a plus —
 * not lime (Naitik, 27 Nov) — so making a sticker is as close as sending one.
 *
 * Favourites and packs (the other chips on the design) arrive with the
 * threads that build them; Recent and Yours need nothing new to exist.
 */
export function StickerDrawer({
  currentUserId,
  conversationId,
  startTab,
  onSticker,
  onGif,
}: {
  currentUserId: string;
  /** Where Create's finished sticker is sent. */
  conversationId: string;
  /** Open on this tab rather than the one last used. */
  startTab?: Tab;
  /** Send this sticker. */
  onSticker: (s: Sticker) => void;
  /** Send this GIF. */
  onGif: (url: string) => void;
}) {
  const supabase = createClient();
  // Read once, as the drawer mounts: it only ever mounts after a tap, so
  // there is no server render for browser storage to disagree with.
  const [tab, setTab] = useState<Tab>(() => startTab ?? readTab());
  const [shelf, setShelf] = useState<Shelf>("yours");
  const [mine, setMine] = useState<Sticker[] | null>(null);
  const [recent, setRecent] = useState<Sticker[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      listMyStickers(supabase, currentUserId),
      listRecentStickers(supabase, currentUserId),
    ]);
    // Said, not swallowed: an empty grid would read as "you have none".
    if (!a.ok || !b.ok) {
      setFailed(!a.ok ? a.error : !b.ok ? b.error : null);
      return;
    }
    setFailed(null);
    setMine(a.value);
    setRecent(b.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the client is recreated each render; the user is what matters
  }, [currentUserId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set after the reads answer
    void load();
  }, [load]);

  function pickTab(t: Tab) {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* private mode: not remembered */ }
  }

  const shown = shelf === "recent" ? recent : mine;

  return (
    <div className="flex h-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-2xl">
      {/* Stickers | GIFs */}
      <div role="tablist" aria-label="Stickers and GIFs" className="mx-3 mt-3 flex shrink-0 gap-0.5 rounded-[14px] bg-surface p-[3px] sm:w-[240px]">
        {(["stickers", "gifs"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => pickTab(t)}
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
          <div className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2.5 pt-3">
            {(["recent", "yours"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={shelf === s}
                onClick={() => setShelf(s)}
                className={`flex h-[30px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-bold transition ${
                  shelf === s ? "bg-foreground text-background" : "bg-surface text-muted hover:text-foreground"
                }`}
              >
                {s === "recent" && <Clock size={13} aria-hidden />}
                {s === "recent" ? "Recent" : "Yours"}
              </button>
            ))}
          </div>

          <p className="shrink-0 px-4 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
            {shelf === "recent" ? "Recent" : "Yours"}
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
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
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
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onSticker(s)}
                        aria-label="Send sticker"
                        className="flex aspect-square items-center justify-center rounded-[14px] bg-white/[0.03] p-1.5 transition hover:bg-white/[0.06] active:scale-95"
                      >
                        <StickerImage sticker={s} box={{ width: 72, height: 72 }} />
                      </button>
                    ))}
              </div>
            )}
            {!failed && shown !== null && shown.length === 0 && (
              <p className="px-2 pt-4 text-center text-xs text-faint">
                {shelf === "recent" ? "Stickers you send show up here." : "Make your first one with Create."}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
