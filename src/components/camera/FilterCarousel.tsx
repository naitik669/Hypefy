"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Blend, Heart } from "lucide-react";
import { haptics } from "@/lib/haptics";
import {
  carouselOrder,
  filterCss,
  loadFavorites,
  NORMAL,
  saveFavorites,
  tintCss,
  toggleFavorite,
  type PhotoFilter,
} from "@/lib/photo-filters";

/** Width of one filter slot, circle plus breathing room. */
const SLOT = 72;

/**
 * The shutter with filters either side of it, Instagram-style: the filter
 * sitting inside the shutter ring is the one in use; swipe or tap to change
 * it, tap the ring to take the photo. Favourites live to the left of Normal,
 * everything else to the right. Long-press a filter (or tap the heart) to
 * favourite it, and it moves left.
 */
export function FilterCarousel({
  selected,
  onSelect,
  favorites,
  onToggleFavorite,
  onShutter,
  disabled,
  thumb,
}: {
  selected: PhotoFilter;
  onSelect: (f: PhotoFilter) => void;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onShutter: () => void;
  disabled?: boolean;
  /** A still of the camera to show each filter on. */
  thumb: string | null;
}) {
  const order = carouselOrder(favorites);
  const scroller = useRef<HTMLDivElement>(null);
  const settling = useRef(false);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const [flash, setFlash] = useState<string | null>(null);

  const index = Math.max(0, order.findIndex((f) => f.id === selected.id));
  const favorite = favorites.includes(selected.id);

  // Keep the selected filter in the ring: on open, and whenever favouriting
  // reorders the list underneath it.
  const orderKey = order.map((f) => f.id).join(",");
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    settling.current = true;
    el.scrollLeft = index * SLOT;
    requestAnimationFrame(() => (settling.current = false));
    // Only when the order changes, not on every scroll-driven selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  useEffect(() => () => {
    if (press.current) clearTimeout(press.current);
  }, []);

  function onScroll() {
    const el = scroller.current;
    if (!el || settling.current) return;
    const i = Math.min(order.length - 1, Math.max(0, Math.round(el.scrollLeft / SLOT)));
    if (order[i] && order[i].id !== selected.id) {
      haptics.select();
      onSelect(order[i]);
    }
  }

  /** A tap selects at once; the glide into the ring is only for show. */
  function goTo(i: number) {
    const el = scroller.current;
    if (!el) return;
    haptics.select();
    onSelect(order[i]);
    settling.current = true;
    const done = () => {
      settling.current = false;
      el.removeEventListener("scrollend", done);
    };
    el.addEventListener("scrollend", done);
    setTimeout(done, 700);
    el.scrollTo({ left: i * SLOT, behavior: "smooth" });
  }

  function favourite(id: string) {
    if (id === NORMAL.id) return;
    haptics.success();
    const adding = !favorites.includes(id);
    onToggleFavorite(id);
    setFlash(adding ? "Added to favourites" : "Removed from favourites");
    setTimeout(() => setFlash(null), 1400);
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {/* Name of the filter in the ring, and its heart */}
      <div className="flex h-8 items-center gap-2">
        <span className="rounded-pill bg-black/45 px-3 py-1 text-[13px] font-bold text-white backdrop-blur-sm">
          {flash ?? selected.name}
        </span>
        {selected.id !== NORMAL.id && (
          <button
            type="button"
            onClick={() => favourite(selected.id)}
            aria-label={favorite ? `Remove ${selected.name} from favourites` : `Add ${selected.name} to favourites`}
            aria-pressed={favorite}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm active:scale-90"
          >
            <Heart size={16} className={favorite ? "fill-[#ff4f7b] text-[#ff4f7b]" : ""} />
          </button>
        )}
      </div>

      <div className="relative h-[88px] w-full">
        <div
          ref={scroller}
          onScroll={onScroll}
          className="no-scrollbar flex h-full snap-x snap-mandatory items-center overflow-x-auto"
          role="listbox"
          aria-label="Filters"
        >
          <div aria-hidden className="h-px flex-none" style={{ width: `calc(50% - ${SLOT / 2}px)` }} />
          {order.map((f, i) => (
            <button
              key={f.id}
              type="button"
              role="option"
              aria-selected={f.id === selected.id}
              aria-label={`${f.name}${favorites.includes(f.id) ? ", favourite" : ""}`}
              onPointerDown={() => {
                longPressed.current = false;
                press.current = setTimeout(() => {
                  longPressed.current = true;
                  favourite(f.id);
                }, 450);
              }}
              onPointerUp={() => press.current && clearTimeout(press.current)}
              onPointerLeave={() => press.current && clearTimeout(press.current)}
              onPointerCancel={() => press.current && clearTimeout(press.current)}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => {
                if (longPressed.current) return;
                if (f.id === selected.id) onShutter();
                else goTo(i);
              }}
              className="relative flex h-full flex-none snap-center items-center justify-center"
              style={{ width: SLOT }}
            >
              <FilterSwatch filter={f} thumb={thumb} active={f.id === selected.id} />
              {favorites.includes(f.id) && f.id !== selected.id && (
                <Heart size={11} aria-hidden className="absolute right-2 top-3 fill-[#ff4f7b] text-[#ff4f7b]" />
              )}
            </button>
          ))}
          <div aria-hidden className="h-px flex-none" style={{ width: `calc(50% - ${SLOT / 2}px)` }} />
        </div>

        {/* The shutter ring, drawn over whichever filter is in the middle */}
        <button
          type="button"
          onClick={onShutter}
          disabled={disabled}
          aria-label={`Take photo with ${selected.name}`}
          className="absolute left-1/2 top-1/2 h-[84px] w-[84px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)] transition-transform active:scale-90 disabled:opacity-40"
        />
      </div>
    </div>
  );
}

/** Filter picker state for a camera screen: open or not, the filter in use, favourites. */
export function useFilterState() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PhotoFilter>(NORMAL);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    // Read after mount: localStorage isn't there during the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavorites(loadFavorites());
  }, []);

  return {
    open,
    selected,
    favorites,
    thumb,
    select: setSelected,
    toggle(snapshot: () => string | null) {
      if (!open) setThumb(snapshot());
      setOpen(!open);
    },
    close() {
      setOpen(false);
      setSelected(NORMAL);
    },
    toggleFavorite(id: string) {
      setFavorites((prev) => {
        const next = toggleFavorite(prev, id);
        saveFavorites(next);
        return next;
      });
    },
  };
}

/** The live look of a filter over the viewfinder: CSS for the video, and its wash. */
export function viewfinderFilter(f: PhotoFilter) {
  return { filter: filterCss(f), tint: tintCss(f) };
}

/** The rail control that opens the filters. */
export function FilterRailButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={open}
      aria-label={open ? "Hide filters" : "Filters"}
      className={`flex w-14 flex-col items-center gap-0.5 py-2 transition active:scale-90 ${open ? "text-accent" : "text-white"}`}
    >
      <Blend size={22} />
      <span className="text-[10px] font-bold">Filter</span>
    </button>
  );
}

function FilterSwatch({ filter, thumb, active }: { filter: PhotoFilter; thumb: string | null; active: boolean }) {
  const tint = tintCss(filter);
  return (
    <span
      className={`relative block overflow-hidden rounded-full transition-all ${
        active ? "h-[66px] w-[66px]" : "h-[52px] w-[52px] border-2 border-white/70"
      }`}
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" draggable={false} className="h-full w-full object-cover" style={{ filter: filterCss(filter) }} />
      ) : (
        <span
          className="block h-full w-full bg-[linear-gradient(135deg,#f9a8d4,#fde68a_45%,#7dd3fc)]"
          style={{ filter: filterCss(filter) }}
        />
      )}
      {tint && <span className="absolute inset-0" style={{ background: tint }} />}
    </span>
  );
}
