"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import { albumCount, type Album, type AlbumItem } from "@/lib/chat-album";

/**
 * Photos and videos sent together, drawn as a folder: a deck of up to three
 * in its left corner, each leaning a little further right, and a frosted
 * glass front carrying the caption. Grey glass when received, lime when sent.
 *
 * The photos run down BEHIND the glass so its blur has colour to pick up.
 * Nothing above the glass may carry filter, opacity or a mask — each makes a
 * backdrop root, and the blur would then see nothing at all.
 */

const W = 156;
const H = 162;
const GLASS_H = 80;
/** Tab and body as one silhouette, so blur and tint follow the folder. */
const GLASS_PATH =
  "M0 12 Q0 0 12 0 H48 Q54 0 58 5 L62 11 Q64 14 69 14 H140 Q156 14 156 30 V64 Q156 80 140 80 H16 Q0 80 0 64 Z";
const RIM_PATH =
  "M0.5 12 Q0.5 0.5 12 0.5 H48 Q53.6 0.5 57.6 5.3 L61.6 11.3 Q63.7 14.5 69 14.5 H140 Q155.5 14.5 155.5 30 V64 Q155.5 79.5 140 79.5 H16 Q0.5 79.5 0.5 64 Z";

/** Back to front: left offset, top offset, lean. */
const DECK = [
  { left: 7, top: 12, rotate: 3 },
  { left: 16, top: 9, rotate: 9 },
  { left: 26, top: 5, rotate: 15 },
];

function Thumb({ item }: { item: AlbumItem }) {
  return item.type === "video" ? (
    <video
      src={`${item.url}#t=0.1`}
      muted
      playsInline
      preload="metadata"
      className="pointer-events-none h-full w-full object-cover"
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.url} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
  );
}

export function MediaFolder({
  album,
  mine,
  onOpen,
}: {
  album: Album;
  mine: boolean;
  onOpen: (index: number) => void;
}) {
  const { items, caption } = album;
  // The front card is the first item; the ones behind it follow.
  const deck = items.slice(0, 3).reverse();
  const hidden = items.length - deck.length;
  const count = albumCount(items);

  return (
    <button
      type="button"
      onClick={() => onOpen(0)}
      aria-label={`${caption ? `${caption}, ` : ""}${count}`}
      data-media-folder
      className="relative block shrink-0 text-left transition-transform active:scale-[0.97]"
      style={{ width: W, height: H }}
    >
      {deck.map((item, i) => {
        const pos = DECK[i + (3 - deck.length)];
        const front = i === deck.length - 1;
        return (
          <span
            key={`${item.url}-${i}`}
            className="absolute overflow-hidden rounded-[13px] bg-surface shadow-[0_8px_18px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.07)]"
            style={{
              width: 84,
              height: 124,
              left: pos.left,
              top: pos.top,
              transform: `rotate(${pos.rotate}deg)`,
              transformOrigin: "0% 100%",
            }}
          >
            <Thumb item={item} />
            {front && hidden > 0 && (
              <span className="absolute inset-x-0 top-0 grid h-[76px] place-items-center bg-gradient-to-b from-black/5 to-black/40 text-xl font-extrabold tracking-tight text-white">
                +{hidden}
              </span>
            )}
            {front && item.type === "video" && (
              <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/55">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                  <path d="M7 4v16l13-8z" />
                </svg>
              </span>
            )}
          </span>
        );
      })}

      <span className="absolute bottom-0 left-0 z-[3] block" style={{ width: W, height: GLASS_H }}>
        {/* The shadow is a sibling beneath the glass, never a filter above it. */}
        <span
          className="absolute rounded-[16px] bg-black/35"
          style={{ inset: "20px 5px -7px", filter: "blur(11px)" }}
        />
        <span
          data-glass
          className="absolute inset-0"
          style={{
            clipPath: `path("${GLASS_PATH}")`,
            background: mine
              ? "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 45%), rgba(163,230,53,0.72)"
              : "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0) 45%), rgba(46,46,46,0.55)",
            WebkitBackdropFilter: "blur(14px) saturate(160%)",
            backdropFilter: "blur(14px) saturate(160%)",
          }}
        />
        <svg className="pointer-events-none absolute inset-0 overflow-visible" viewBox={`0 0 ${W} ${GLASS_H}`} aria-hidden="true">
          <path
            d={RIM_PATH}
            fill="none"
            strokeWidth={1}
            stroke={mine ? "rgba(236,252,203,0.75)" : "rgba(255,255,255,0.3)"}
          />
        </svg>
        <span className="absolute inset-x-[11px] bottom-[9px] block">
          {caption && (
            <span
              className={`line-clamp-2 block text-[12.5px] font-bold leading-tight tracking-[-0.01em] ${
                mine ? "text-accent-ink" : "text-white"
              }`}
            >
              {caption}
            </span>
          )}
          <span
            className={`mt-0.5 block ${caption ? "text-[10px]" : "text-[12.5px] font-bold"} ${
              mine ? (caption ? "text-accent-ink/60" : "text-accent-ink") : caption ? "text-white/70" : "text-white"
            }`}
          >
            {count}
          </span>
        </span>
      </span>
    </button>
  );
}

/** Full screen, one item at a time, swiped sideways. */
export function AlbumViewer({
  album,
  start,
  onClose,
}: {
  album: Album;
  start: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const railRef = useRef<HTMLDivElement>(null);
  useOverlayBackButton(true, onClose);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const rail = railRef.current;
    if (rail) rail.scrollLeft = start * rail.clientWidth;
    return () => {
      document.body.style.overflow = prev;
    };
  }, [start]);

  // Only the item on screen keeps playing.
  useEffect(() => {
    railRef.current?.querySelectorAll("video").forEach((v) => {
      if (Number(v.dataset.index) !== index) v.pause();
    });
  }, [index]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-black" role="dialog" aria-label="Photos">
      <div className="flex items-center justify-between px-4 pb-2 pt-[calc(var(--sat,0px)+12px)] text-white">
        <span className="text-sm font-semibold tabular-nums">
          {index + 1} / {album.items.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"
        >
          <X size={20} />
        </button>
      </div>

      <div
        ref={railRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== index) setIndex(i);
        }}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none]"
      >
        {album.items.map((item, i) => (
          <div key={`${item.url}-${i}`} className="flex h-full w-full shrink-0 snap-center items-center justify-center">
            {item.type === "video" ? (
              <video
                data-index={i}
                src={item.url}
                controls
                playsInline
                preload="metadata"
                className="max-h-full max-w-full"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt="" draggable={false} className="max-h-full max-w-full object-contain" />
            )}
          </div>
        ))}
      </div>

      {album.caption && (
        <p className="px-5 pb-[calc(var(--sab,0px)+18px)] pt-3 text-center text-[15px] font-semibold text-white">
          {album.caption}
        </p>
      )}
    </div>,
    document.body,
  );
}
