"use client";

import { useEffect, useRef } from "react";
import { Music, Pause, X } from "lucide-react";
import { type Track, playPreview, ensurePreviewPlaying, pausePreview, useIsPlaying } from "@/lib/music";

/**
 * Compact playable song chip — artwork (spins while playing), title · artist,
 * tap to toggle the 30s preview. `onRemove` renders an X for composer use.
 * `autoPlayInView` starts the preview when the chip scrolls into view and
 * pauses it when it scrolls away (browsers gate this until the first tap —
 * rejected plays are swallowed, so it simply starts working after that).
 */
export function TrackChip({
  track,
  onRemove,
  autoPlayInView = false,
  className = "",
}: {
  track: Track;
  onRemove?: () => void;
  autoPlayInView?: boolean;
  className?: string;
}) {
  const playing = useIsPlaying(track.id);
  const rootRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    if (!autoPlayInView) return;
    const el = rootRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          ensurePreviewPlaying(track);
        } else if (playingRef.current) {
          pausePreview();
        }
      },
      { threshold: 0.6 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      if (playingRef.current) pausePreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlayInView, track.id]);

  return (
    <div
      ref={rootRef}
      className={`inline-flex max-w-[230px] items-center gap-1.5 rounded-xl border border-border bg-surface py-0.5 pl-0.5 pr-2 ${className}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          playPreview(track);
        }}
        aria-label={playing ? "Pause preview" : "Play preview"}
        className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-elevated"
      >
        {track.artwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.artwork}
            alt=""
            className={`h-full w-full object-cover ${playing ? "animate-[spin_4s_linear_infinite]" : ""}`}
          />
        ) : (
          <Music size={11} className="text-accent" />
        )}
        {playing && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white">
            <Pause size={10} fill="currentColor" />
          </span>
        )}
      </button>
      <p className="min-w-0 truncate text-[11px] leading-tight">
        <span className="font-semibold">{track.title}</span>
        {track.artist && <span className="text-muted"> · {track.artist}</span>}
      </p>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          aria-label="Remove song"
          className="-mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
