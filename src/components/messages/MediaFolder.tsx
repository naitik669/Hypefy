"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import { albumCount, type Album, type AlbumItem } from "@/lib/chat-album";
import { BLANK_POSTER } from "@/lib/blank-poster";

/**
 * Photos and videos sent together, drawn as a folder: up to three photos
 * standing out of its left corner, leaning right, in front of a clear glass
 * front with the caption. Nothing else on it.
 *
 * The photos dip BEHIND the glass so its blur has something to blur.
 * Nothing above the glass may carry filter, opacity or a mask — each makes a
 * backdrop root, and the blur would then see nothing at all.
 */

/** The folder is drawn at this size; the numbers below are at 1x. */
const SCALE = 1.3;
const px = (n: number) => Math.round(n * SCALE * 10) / 10;
const scalePath = (d: string) => d.replace(/-?\d+(\.\d+)?/g, (n) => String(px(Number(n))));

const W = px(152);
const H = px(172);
const GLASS_H = px(64);
/** Tab and body as one silhouette, so the blur follows the folder. */
const GLASS_PATH = scalePath(
  "M0 12 Q0 0 12 0 H44 Q50 0 54 5 L58 10 Q60 13 65 13 H138 Q152 13 152 27 V50 Q152 64 138 64 H14 Q0 64 0 50 Z",
);
const RIM_PATH = scalePath(
  "M0.4 12 Q0.4 0.4 12 0.4 H44 Q49.7 0.4 53.6 5.3 L57.6 10.3 Q59.7 13.4 65 13.4 H138 Q151.6 13.4 151.6 27 V50 Q151.6 63.6 138 63.6 H14 Q0.4 63.6 0.4 50 Z",
);

const CARD_W = px(82);
const CARD_H = px(128);
/** Back to front: left offset, top offset, lean. */
const DECK = [
  { left: px(6), top: px(16), rotate: 2 },
  { left: px(24), top: px(10), rotate: 7 },
  { left: px(42), top: px(4), rotate: 12 },
];

/** Frosted, not see-through: the photos behind only tint it. */
const GLASS = {
  received: {
    fill: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0) 40%), rgba(34,34,34,0.82)",
    rim: "rgba(255,255,255,0.12)",
    text: "text-white",
  },
  sent: {
    fill: "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0) 40%), rgba(163,230,53,0.8)",
    rim: "rgba(236,252,203,0.55)",
    text: "text-accent-ink",
  },
};

function Thumb({ item }: { item: AlbumItem }) {
  return item.type === "video" ? (
    <video poster={BLANK_POSTER} src={`${item.url}#t=0.1`} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.url} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
  );
}

export function MediaFolder({
  album,
  mine,
  onOpen,
  editing = false,
}: {
  album: Album;
  mine: boolean;
  onOpen: (index: number) => void;
  /** The caption is being edited in the composer: show it live, with a caret. */
  editing?: boolean;
}) {
  const { items, caption } = album;
  // The front card is the first item; the ones behind it follow.
  const deck = items.slice(0, 3).reverse();
  const hidden = items.length - deck.length;
  const look = mine ? GLASS.sent : GLASS.received;

  return (
    <button
      type="button"
      onClick={() => onOpen(0)}
      aria-label={`${caption ? `${caption}, ` : ""}${albumCount(items)}`}
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
            className="absolute overflow-hidden rounded-[15px] bg-surface shadow-[0_4px_14px_rgba(0,0,0,0.35)]"
            style={{
              width: CARD_W,
              height: CARD_H,
              left: pos.left,
              top: pos.top,
              transform: `rotate(${pos.rotate}deg)`,
              transformOrigin: "0% 100%",
            }}
          >
            <Thumb item={item} />
            {front && hidden > 0 && (
              <span
                data-more
                className="absolute inset-x-0 top-0 grid place-items-center bg-black/35 text-2xl font-semibold text-white"
                style={{ height: H - GLASS_H - pos.top + px(6) }}
              >
                +{hidden}
              </span>
            )}
          </span>
        );
      })}

      <span className="absolute bottom-0 left-0 z-[3] block" style={{ width: W, height: GLASS_H }}>
        <span
          data-glass
          className="absolute inset-0"
          style={{
            clipPath: `path("${GLASS_PATH}")`,
            background: look.fill,
            WebkitBackdropFilter: "blur(18px) saturate(160%)",
            backdropFilter: "blur(18px) saturate(160%)",
          }}
        />
        <svg className="pointer-events-none absolute inset-0 overflow-visible" viewBox={`0 0 ${W} ${GLASS_H}`} aria-hidden="true">
          <path d={RIM_PATH} fill="none" strokeWidth={1} stroke={look.rim} />
        </svg>
        {(caption || editing) && (
          <span
            data-folder-caption
            className={`absolute inset-x-[14px] bottom-[12px] line-clamp-2 text-[15px] font-semibold leading-[1.2] ${look.text}`}
          >
            {caption}
            {editing && (
              <span aria-hidden="true" className={`animate-caret ml-px inline-block h-[16px] w-[2px] translate-y-[3px] rounded-full ${mine ? "bg-accent-ink" : "bg-white"}`} />
            )}
          </span>
        )}
      </span>
    </button>
  );
}

/* ── Viewer ──────────────────────────────────────────────────────────────── */

type Gesture = {
  id: number;
  x: number;
  y: number;
  t: number;
  axis: null | "x" | "y" | "pan";
  panX: number;
  panY: number;
};

/** How far a swipe must travel, as a share of the width, to change photo. */
const PAGE_SHARE = 0.18;
/** Or how fast, in px/ms. */
const FLICK = 0.35;
const EASE = "transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)";

/**
 * Full screen, one photo or video at a time. Swipe sideways to move, down to
 * close; pinch or double-tap to zoom, and drag to look around while zoomed.
 * A tap hides the sender and caption so only the photo is left.
 */
export function AlbumViewer({
  album,
  start,
  onClose,
  sender,
  sentAt,
}: {
  album: Album;
  start: number;
  onClose: () => void;
  /** Who sent it. */
  sender: { name: string; hue?: number; avatarUrl?: string | null };
  /** When, already worded — "Today, 9:41". */
  sentAt: string;
}) {
  const count = album.items.length;
  const [index, setIndex] = useState(Math.min(Math.max(start, 0), count - 1));
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 390 : window.innerWidth));
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [pinching, setPinching] = useState(false);
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });
  const [chrome, setChrome] = useState(true);
  const [paused, setPaused] = useState(true);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useOverlayBackButton(true, onClose);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("resize", onResize);
      if (tapTimer.current) clearTimeout(tapTimer.current);
    };
  }, []);

  const go = useCallback(
    (to: number) => {
      setIndex(Math.min(Math.max(to, 0), count - 1));
      setZoom({ scale: 1, x: 0, y: 0 });
      setDx(0);
    },
    [count],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, onClose]);

  // Moving on stops whatever was playing.
  useEffect(() => {
    trackRef.current?.querySelectorAll("video").forEach((v) => v.pause());
  }, [index]);

  function toggleVideo(): boolean {
    const v = trackRef.current?.querySelector<HTMLVideoElement>(`video[data-index="${index}"]`);
    if (!v) return false;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
    return true;
  }

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("[data-viewer-control]")) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), scale: zoom.scale };
      setPinching(true);
      gesture.current = null;
      setDx(0);
      setDy(0);
      return;
    }
    gesture.current = {
      id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(),
      axis: zoom.scale > 1 ? "pan" : null, panX: zoom.x, panY: zoom.y,
    };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const scale = Math.min(4, Math.max(1, (pinch.current.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist));
      setZoom((z) => ({ ...z, scale }));
      return;
    }

    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const mx = e.clientX - g.x;
    const my = e.clientY - g.y;

    if (g.axis === "pan") {
      setZoom((z) => ({ ...z, x: g.panX + mx, y: g.panY + my }));
      return;
    }
    if (!g.axis) {
      if (Math.hypot(mx, my) < 8) return;
      g.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
    }
    if (g.axis === "x") {
      const atEdge = (index === 0 && mx > 0) || (index === count - 1 && mx < 0);
      setDx(atEdge ? mx / 3 : mx);
    } else {
      setDy(Math.max(0, my));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);

    if (pinch.current) {
      if (pointers.current.size < 2) {
        pinch.current = null;
        setPinching(false);
        setZoom((z) => (z.scale < 1.05 ? { scale: 1, x: 0, y: 0 } : z));
      }
      setDragging(false);
      return;
    }

    const g = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (!g || g.id !== e.pointerId) return;
    const mx = e.clientX - g.x;
    const my = e.clientY - g.y;
    const dt = Math.max(1, performance.now() - g.t);

    if (g.axis === "x") {
      const v = mx / dt;
      if ((mx < -width * PAGE_SHARE || v < -FLICK) && index < count - 1) go(index + 1);
      else if ((mx > width * PAGE_SHARE || v > FLICK) && index > 0) go(index - 1);
      else setDx(0);
      return;
    }
    if (g.axis === "y") {
      if (my > 120 || my / dt > 0.5) onClose();
      else setDy(0);
      return;
    }
    if (g.axis === "pan" && Math.hypot(mx, my) >= 8) return;

    // A tap: two quick ones zoom; one plays or pauses a video, or on a photo
    // hides and shows everything around it.
    const now = performance.now();
    const prev = lastTap.current;
    if (prev && now - prev.t < 280 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30) {
      lastTap.current = null;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      setZoom((z) => (z.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 }));
      return;
    }
    lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      if (album.items[index]?.type !== "video" || !toggleVideo()) setChrome((c) => !c);
    }, 280);
  }

  if (typeof document === "undefined") return null;

  const closing = Math.min(1, dy / 400);
  const showChrome = chrome && dy === 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] select-none overflow-hidden"
      style={{ touchAction: "none", background: `rgba(0,0,0,${1 - closing * 0.6})` }}
      role="dialog"
      aria-label="Photos"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={trackRef}
        data-viewer-track
        className="absolute inset-y-0 left-0 flex"
        style={{
          width: width * count,
          transform: `translate3d(${-index * width + dx}px, ${dy}px, 0) scale(${1 - closing * 0.15})`,
          transition: dragging ? "none" : EASE,
        }}
      >
        {album.items.map((item, i) => {
          const near = Math.abs(i - index) <= 1;
          const current = i === index;
          return (
            <div
              key={`${item.url}-${i}`}
              className="relative flex h-full shrink-0 items-center justify-center overflow-hidden"
              style={{ width }}
            >
              {near && (
                <div
                  className="flex h-full w-full items-center justify-center"
                  style={
                    current
                      ? {
                          transform: `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.scale})`,
                          transition: dragging || pinching ? "none" : EASE,
                        }
                      : undefined
                  }
                >
                  {item.type === "video" ? (
                    <video poster={BLANK_POSTER}
                      data-index={i}
                      src={item.url}
                      playsInline
                      preload="metadata"
                      onPlay={() => setPaused(false)}
                      onPause={() => setPaused(true)}
                      className="pointer-events-none max-h-full max-w-full"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt="" draggable={false} className="pointer-events-none max-h-full max-w-full object-contain" />
                  )}
                </div>
              )}
              {current && item.type === "video" && paused && (
                <span className="pointer-events-none absolute grid h-16 w-16 place-items-center rounded-full bg-black/40">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Who sent it, and when */}
      <div
        className="absolute inset-x-0 top-0 flex items-center gap-2.5 bg-gradient-to-b from-black/60 to-transparent px-2 pb-8 pt-[calc(var(--sat,0px)+8px)] text-white transition-opacity duration-200"
        style={{ opacity: showChrome ? 1 : 0, pointerEvents: showChrome ? "auto" : "none" }}
      >
        <button
          type="button"
          data-viewer-control
          onClick={onClose}
          aria-label="Close"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full active:bg-white/10"
        >
          <X size={22} />
        </button>
        <Avatar name={sender.name} hue={sender.hue} size={34} src={sender.avatarUrl ?? undefined} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[14px] font-semibold">{sender.name}</p>
          <p className="truncate text-[12px] text-white/60">{sentAt}</p>
        </div>
        {count > 1 && (
          <span className="shrink-0 pr-3 text-[13px] font-medium tabular-nums text-white/70">
            {index + 1} / {count}
          </span>
        )}
      </div>

      {/* The caption, and where you are in the folder */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/60 to-transparent px-6 pb-[calc(var(--sab,0px)+18px)] pt-10 text-white transition-opacity duration-200"
        style={{ opacity: showChrome ? 1 : 0 }}
      >
        {album.caption && <p className="text-center text-[15px] leading-snug">{album.caption}</p>}
        {count > 1 && count <= 12 && (
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {album.items.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${i === index ? "w-4 bg-white" : "w-1.5 bg-white/40"}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
