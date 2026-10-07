"use client";

import Link from "next/link";
import { Music, Pause, Play } from "lucide-react";
import { playPreview, useIsPlaying, type Track } from "@/lib/music";
import { soundHref } from "@/components/music/SoundPill";
import { originalShotId } from "@/lib/track";

/**
 * One sound in a list: a cover that plays it, its name (which opens its
 * page), and whatever the list wants to offer on the right.
 *
 * Original audio wears a round cover, a song a squared one, so a list that
 * mixes the two can be read at a glance.
 */
export function SoundRow({
  track,
  right,
  onPlay,
}: {
  track: Track;
  right?: React.ReactNode;
  /** Played from here by hand: lets a queue know to carry on from this one. */
  onPlay?: (track: Track) => void;
}) {
  const playing = useIsPlaying(track.id);
  const original = originalShotId(track.id) !== null;

  return (
    <div className="flex items-center gap-3 px-4 py-2" data-sound-row={track.id}>
      <button
        type="button"
        onClick={() => {
          onPlay?.(track);
          // Pressing play is choosing to listen: heard even when the feed is muted.
          playPreview(track, { audible: true });
        }}
        aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}
        aria-pressed={playing}
        className={`relative h-11 w-11 shrink-0 overflow-hidden bg-surface ${original ? "rounded-full" : "rounded-xl"}`}
      >
        {track.artwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.artwork} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-faint">
            <Music size={16} />
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </span>
      </button>
      <Link href={soundHref(track.id)} prefetch={false} className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-semibold ${playing ? "text-accent" : ""}`}>{track.title}</span>
        {track.artist && <span className="block truncate text-xs text-muted">{track.artist}</span>}
      </Link>
      {right}
    </div>
  );
}
