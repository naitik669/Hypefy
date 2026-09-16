"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import { albumCount, type Album, type AlbumItem } from "@/lib/chat-album";

/**
 * Photos and videos sent together, drawn as a folder: a deck of up to three
 * standing up out of its left corner, each leaning a little further right,
 * and a low frosted glass front carrying the caption. The tab carries the
 * count. Grey glass when received, lime glass when sent.
 *
 * The photos dip BEHIND the glass so its blur has colour to pick up.
 * Nothing above the glass may carry filter, opacity or a mask — each makes a
 * backdrop root, and the blur would then see nothing at all.
 */

const W = 152;
const H = 172;
const GLASS_H = 64;
/** Tab and body as one silhouette, so blur and tint follow the folder. */
const GLASS_PATH =
  "M0 12 Q0 0 12 0 H44 Q50 0 54 5 L58 10 Q60 13 65 13 H138 Q152 13 152 27 V50 Q152 64 138 64 H14 Q0 64 0 50 Z";
const RIM_PATH =
  "M0.5 12 Q0.5 0.5 12 0.5 H44 Q49.7 0.5 53.6 5.3 L57.6 10.3 Q59.7 13.5 65 13.5 H138 Q151.5 13.5 151.5 27 V50 Q151.5 63.5 138 63.5 H14 Q0.5 63.5 0.5 50 Z";

const CARD_W = 82;
const CARD_H = 128;
/** Back to front: left offset, top offset, lean. */
const DECK = [
  { left: 6, top: 16, rotate: 2 },
  { left: 24, top: 10, rotate: 7 },
  { left: 42, top: 4, rotate: 12 },
];

const GLASS = {
  received: {
    fill: "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.02) 55%), rgba(38,38,38,0.4)",
    rim: "rgba(255,255,255,0.32)",
  },
  sent: {
    fill: "linear-gradient(180deg, rgba(255,255,255,0.2), rgba(255,255,255,0.02) 55%), rgba(163,230,53,0.52)",
    rim: "rgba(217,249,157,0.7)",
  },
};

function Thumb({ item, blurred }: { item: AlbumItem; blurred?: boolean }) {
  // Blurred behind "+N": scaled up a touch so the soft edge stays inside.
  const cls = `h-full w-full object-cover ${blurred ? "scale-110 blur-[5px]" : ""}`;
  return item.type === "video" ? (
    <video src={`${item.url}#t=0.1`} muted playsInline preload="metadata" className={`pointer-events-none ${cls}`} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.url} alt="" loading="lazy" decoding="async" draggable={false} className={cls} />
  );
}

function StackGlyph() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="3" width="14" height="14" rx="3" />
      <path d="M3 8v10a3 3 0 0 0 3 3h10" strokeLinecap="round" />
    </svg>
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
  const look = mine ? GLASS.sent : GLASS.received;

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
        const more = front && hidden > 0;
        return (
          <span
            key={`${item.url}-${i}`}
            className="absolute overflow-hidden rounded-[12px] bg-surface shadow-[0_6px_16px_rgba(0,0,0,0.4)] ring-1 ring-inset ring-white/10"
            style={{
              width: CARD_W,
              height: CARD_H,
              left: pos.left,
              top: pos.top,
              transform: `rotate(${pos.rotate}deg)`,
              transformOrigin: "0% 100%",
            }}
          >
            <Thumb item={item} blurred={more} />
            {more && (
              <span
                data-more
                className="absolute inset-x-0 top-0 grid place-items-center bg-black/30 text-[22px] font-extrabold tracking-tight text-white"
                style={{ height: H - GLASS_H - pos.top + 6 }}
              >
                +{hidden}
              </span>
            )}
            {front && !more && item.type === "video" && (
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
        <span className="absolute rounded-[16px] bg-black/30" style={{ inset: "18px 6px -6px", filter: "blur(10px)" }} />
        <span
          data-glass
          className="absolute inset-0"
          style={{
            clipPath: `path("${GLASS_PATH}")`,
            background: look.fill,
            WebkitBackdropFilter: "blur(12px) saturate(180%)",
            backdropFilter: "blur(12px) saturate(180%)",
          }}
        />
        <svg className="pointer-events-none absolute inset-0 overflow-visible" viewBox={`0 0 ${W} ${GLASS_H}`} aria-hidden="true">
          <path d={RIM_PATH} fill="none" strokeWidth={1} stroke={look.rim} />
        </svg>
        {/* The tab carries the count, so the front is free for the caption. */}
        <span className="absolute left-[11px] top-[2px] flex h-[10px] items-center gap-[3px] text-[9px] font-bold tabular-nums leading-none text-white/85">
          <StackGlyph />
          {items.length}
        </span>
        <span className="absolute inset-x-[11px] bottom-[9px] top-[17px] flex items-end">
          <span className="line-clamp-2 text-[12.5px] font-bold leading-[1.2] tracking-[-0.01em] text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.35)]">
            {caption || count}
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
