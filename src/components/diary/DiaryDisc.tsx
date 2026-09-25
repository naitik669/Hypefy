"use client";

import { useEffect, useRef, useState } from "react";
import { Music, Plus, X } from "lucide-react";
import { claimPreview, pausePreview, playPreview, useIsPlaying, type Track } from "@/lib/music";

/** A Diary's song goes round again when it ends, wherever it is played. */
/** A tap on the song is a deliberate play, so it is heard even when the app
 *  is muted — the mute is for songs that start on their own. */
const LOOP = { loop: true, audible: true } as const;

/**
 * The song on a Diary, as a black CD tucked behind the page, its cover in
 * the middle.
 *
 * A sliver shows past the page's right edge at rest — enough to see there is
 * a song, not enough to compete with the words. Tap it and it slides out a
 * little further, grows, and turns slowly while the song plays; tap again and
 * it slips back. The song repeats until it is stopped. With no song yet (the
 * composer), the same disc is blank with a plus, and tapping it adds one.
 *
 * The parent positions it (absolute, behind the page); the disc only moves
 * itself relative to that spot, `slide` pixels right and `lift` pixels up, so
 * each place it sits can decide how much room there is.
 */
export function DiaryDisc({
  track,
  size = 112,
  slide = 12,
  lift = 0,
  onAdd,
  autoPlay = false,
  className = "",
  style,
}: {
  track: Track | null;
  /** px, or any CSS length — the cover and the hole are drawn in proportion. */
  size?: number | string;
  slide?: number;
  /** And this far up, for a disc that peeks out over the top of its page. */
  lift?: number;
  /** For an empty disc: what tapping it does. */
  onAdd?: () => void;
  /** Start playing on mount, stop on unmount — the card on top of the deck, and full-screen. */
  autoPlay?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const playing = useIsPlaying(track?.id);
  const icon = typeof size === "number" ? Math.round(size * 0.15) : 20;

  // The song by its id, not the object: a page re-read from the server is a
  // new object with the same song, and must not restart it.
  const song = useRef(track);
  useEffect(() => {
    song.current = track;
  });
  const songId = track?.id;
  useEffect(() => {
    const t = song.current;
    if (!autoPlay || !t) return;
    // From the top each time: a page coming round again plays its song
    // afresh rather than picking up where it was cut off.
    // A claim rather than play-then-pause: the page that replaces this one
    // may start before this one lets go.
    return claimPreview(t, { ...LOOP, restart: true });
  }, [autoPlay, songId]);

  const label = track
    ? `${playing ? "Pause" : "Play"} ${track.title}${track.artist ? ` by ${track.artist}` : ""}`
    : "Add a song";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (track) playPreview(track, LOOP);
        else onAdd?.();
      }}
      aria-label={label}
      aria-pressed={track ? playing : undefined}
      data-playing={playing || undefined}
      data-disc=""
      className={`rounded-full transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
      style={{
        width: size,
        height: size,
        transform: playing ? `translate(${slide}px, ${-lift}px) scale(1.12)` : undefined,
        ...style,
      }}
    >
      <span
        className={`relative block h-full w-full rounded-full ${playing ? "diary-disc-spin" : ""}`}
        style={{
          background: track ? DISC : DISC_BLANK,
          boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.14), 0 12px 26px -8px rgb(0 0 0 / 0.8)",
        }}
      >
        {/* The label — the song's cover, filling the middle of the disc, or a
            plus on a blank one. */}
        <span
          className="absolute left-1/2 top-1/2 flex h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full bg-[#1d1d23]"
          style={{ boxShadow: "0 0 0 1.5px rgb(0 0 0 / 0.6), 0 0 0 3px rgb(255 255 255 / 0.08)" }}
        >
          {track?.artwork ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.artwork} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : track ? (
            <Music size={icon} className="text-white/70" />
          ) : (
            <Plus size={icon} className="text-white/80" strokeWidth={2.5} />
          )}
        </span>
        {/* The hole. */}
        <span
          className="absolute left-1/2 top-1/2 h-[9%] w-[9%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-background"
          style={{
            boxShadow: "0 0 0 2px rgb(0 0 0 / 0.5), 0 0 0 3.5px rgb(255 255 255 / 0.22)",
          }}
        />
      </span>
    </button>
  );
}

/** How far the page stops short of the right edge to leave the disc room. */
const GUTTER = 44;
/** The disc before the page has been measured, and its limits after. */
const SLEEVE_DISC = 108;
const SLEEVE_MIN = 96;
const SLEEVE_MAX = 176;

/**
 * A page with its CD tucked behind it: the page stops short of the right edge
 * and the disc sits in that gap, most of it hidden under the page. Without a
 * song (and nothing to add one with) the page takes the full width.
 *
 * The disc is sized to the page — about 60% of its height — so a tall page
 * has a big CD and a short one a small one. The gap stays the same width, so
 * resizing the disc never moves the page: a bigger disc shows a taller arc.
 */
export function DiscSleeve({
  track,
  onAdd,
  children,
}: {
  track: Track | null;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  const page = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(SLEEVE_DISC);
  const sleeved = !!track || !!onAdd;
  useEffect(() => {
    const el = page.current;
    if (!sleeved || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      // In steps of 4px, so a page settling by a pixel does not redraw it.
      const next = Math.round(Math.min(SLEEVE_MAX, Math.max(SLEEVE_MIN, e.contentRect.height * 0.6)) / 4) * 4;
      setSize((s) => (s === next ? s : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [sleeved]);

  if (!sleeved) return <>{children}</>;
  return (
    <div className="relative" style={{ paddingRight: GUTTER }}>
      <DiaryDisc
        track={track}
        onAdd={onAdd}
        size={size}
        slide={12}
        className="absolute right-2 top-1/2 z-0"
        style={{ marginTop: -size / 2 }}
      />
      <div ref={page} className="relative z-10">
        {children}
      </div>
    </div>
  );
}

/**
 * The song's name on the page, under the words — the other way to play it,
 * for anyone who does not think to tap the disc.
 *
 * Over a photo it is a frosted squircle sized to its own text, which reads on
 * any picture and covers almost none of it; it was a black slab across the
 * middle of the card. It lands with the page, scaling up and settling, so the
 * song is the thing that moves rather than the writer's name.
 */
export function SongLine({
  track,
  onRemove,
  glass = false,
}: {
  track: Track;
  onRemove?: () => void;
  /** Over a photo: a frosted squircle that pops in. */
  glass?: boolean;
}) {
  const playing = useIsPlaying(track.id);
  return (
    <div className={`flex min-w-0 items-center gap-1 ${glass ? "animate-song-pop origin-left" : ""}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          playPreview(track, LOOP);
        }}
        className={
          glass
            ? "flex min-w-0 items-center gap-2 rounded-[13px] border border-white/15 bg-white/[0.14] py-1.5 pl-2.5 pr-3 text-left text-[12px] text-white/90 backdrop-blur-md transition-colors hover:bg-white/20"
            : "flex min-w-0 items-center gap-2 rounded-full py-1 pr-2 text-left text-[12px] text-white/70 transition-colors hover:text-white"
        }
      >
        <span aria-hidden className="flex h-3 w-3.5 shrink-0 items-end justify-between">
          {[0.55, 1, 0.7].map((h, i) => (
            <span
              key={i}
              className={`w-[3px] rounded-full bg-current ${playing ? "diary-eq" : ""}`}
              style={{ height: `${h * 100}%`, animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </span>
        <span className="truncate">
          <span className="font-semibold text-white/90">{track.title}</span>
          {track.artist && <span> · {track.artist}</span>}
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            pausePreview();
            onRemove();
          }}
          aria-label="Remove song"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/**
 * A CD's face, in black: a dark disc with the faint rainbow a real one throws
 * where the light catches it, and the fine rings of its grooves. Dark so the
 * cover in the middle is the colour on it — the song, not the plastic.
 */
const DISC = [
  "repeating-radial-gradient(circle at 50% 50%, rgb(255 255 255 / 0.035) 0 1px, transparent 1px 3px)",
  "conic-gradient(from 20deg, transparent, rgb(150 180 255 / 0.18) 10%, transparent 22%, rgb(255 160 215 / 0.14) 38%, transparent 52%, rgb(160 255 215 / 0.12) 68%, transparent 82%, rgb(255 225 150 / 0.1) 92%, transparent)",
  "radial-gradient(circle at 50% 50%, #1e1e24 0%, #0c0c0f 72%, #16161b 100%)",
].join(", ");

/** A blank disc — no song on it yet. The same black, without the shine. */
const DISC_BLANK = [
  "repeating-radial-gradient(circle at 50% 50%, rgb(255 255 255 / 0.03) 0 1px, transparent 1px 3px)",
  "radial-gradient(circle at 50% 50%, #202026 0%, #0e0e11 75%, #18181d 100%)",
].join(", ");
