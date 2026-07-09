"use client";

import { Music, Pause, X } from "lucide-react";
import { type Track, playPreview, useIsPlaying } from "@/lib/music";

/**
 * Compact playable song chip — artwork (spins while playing), title · artist,
 * tap to toggle the 30s preview. `onRemove` renders an X for composer use.
 */
export function TrackChip({
  track,
  onRemove,
  className = "",
}: {
  track: Track;
  onRemove?: () => void;
  className?: string;
}) {
  const playing = useIsPlaying(track.id);

  return (
    <div
      className={`inline-flex max-w-full items-center gap-2 rounded-pill border border-border bg-surface py-1 pl-1 pr-2.5 ${className}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          playPreview(track);
        }}
        aria-label={playing ? "Pause preview" : "Play preview"}
        className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-elevated"
      >
        {track.artwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.artwork}
            alt=""
            className={`h-full w-full object-cover ${playing ? "animate-[spin_4s_linear_infinite]" : ""}`}
          />
        ) : (
          <Music size={13} className="text-accent" />
        )}
        {playing && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white">
            <Pause size={11} fill="currentColor" />
          </span>
        )}
      </button>
      <p className="min-w-0 truncate text-xs leading-tight">
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
          className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
