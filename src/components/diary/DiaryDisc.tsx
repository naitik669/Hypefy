"use client";

import { useEffect } from "react";
import { Music, Plus, X } from "lucide-react";
import { ensurePreviewPlaying, pausePreview, playPreview, useIsPlaying, type Track } from "@/lib/music";

/**
 * The song on a Diary, as a black CD tucked behind the page, its cover in
 * the middle.
 *
 * A sliver shows past the page's right edge at rest — enough to see there is
 * a song, not enough to compete with the words. Tap it and it slides out a
 * little further, grows, and turns slowly while the song plays; tap again and
 * it slips back. With no song yet (the composer), the same disc is blank with
 * a plus, and tapping it adds one.
 *
 * The parent positions it (absolute, behind the page); the disc only moves
 * itself relative to that spot, by `slide` pixels to the right, so each place
 * it sits can decide how much room there is.
 */
export function DiaryDisc({
  track,
  size = 112,
  slide = 12,
  onAdd,
  autoPlay = false,
  className = "",
  style,
}: {
  track: Track | null;
  size?: number;
  slide?: number;
  /** For an empty disc: what tapping it does. */
  onAdd?: () => void;
  /** Start playing on mount, stop on unmount (full-screen). */
  autoPlay?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const playing = useIsPlaying(track?.id);

  useEffect(() => {
    if (!autoPlay || !track) return;
    ensurePreviewPlaying(track);
    return () => pausePreview();
  }, [autoPlay, track]);

  const label = track
    ? `${playing ? "Pause" : "Play"} ${track.title}${track.artist ? ` by ${track.artist}` : ""}`
    : "Add a song";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (track) playPreview(track);
        else onAdd?.();
      }}
      aria-label={label}
      aria-pressed={track ? playing : undefined}
      data-playing={playing || undefined}
      className={`rounded-full transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
      style={{
        width: size,
        height: size,
        transform: playing ? `translateX(${slide}px) scale(1.12)` : undefined,
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
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full bg-[#1d1d23]"
          style={{ width: size * 0.6, height: size * 0.6, boxShadow: "0 0 0 1.5px rgb(0 0 0 / 0.6), 0 0 0 3px rgb(255 255 255 / 0.08)" }}
        >
          {track?.artwork ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.artwork} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : track ? (
            <Music size={size * 0.14} className="text-white/70" />
          ) : (
            <Plus size={size * 0.16} className="text-white/80" strokeWidth={2.5} />
          )}
        </span>
        {/* The hole. */}
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background"
          style={{
            width: size * 0.09,
            height: size * 0.09,
            boxShadow: "0 0 0 2px rgb(0 0 0 / 0.5), 0 0 0 3.5px rgb(255 255 255 / 0.22)",
          }}
        />
      </span>
    </button>
  );
}

/** How far the page stops short of the right edge to leave the disc room. */
const GUTTER = 44;
const SLEEVE_DISC = 108;

/**
 * A page with its CD tucked behind it: the page stops short of the right edge
 * and the disc sits in that gap, most of it hidden under the page. Without a
 * song (and nothing to add one with) the page takes the full width.
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
  if (!track && !onAdd) return <>{children}</>;
  return (
    <div className="relative" style={{ paddingRight: GUTTER }}>
      <DiaryDisc
        track={track}
        onAdd={onAdd}
        size={SLEEVE_DISC}
        slide={12}
        className="absolute right-2 top-1/2 z-0"
        style={{ marginTop: -SLEEVE_DISC / 2 }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * The song's name on the page, under the words — the other way to play it,
 * for anyone who does not think to tap the disc.
 */
export function SongLine({ track, onRemove }: { track: Track; onRemove?: () => void }) {
  const playing = useIsPlaying(track.id);
  return (
    <div className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          playPreview(track);
        }}
        className="flex min-w-0 items-center gap-2 rounded-full py-1 pr-2 text-left text-[12px] text-white/70 transition-colors hover:text-white"
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
