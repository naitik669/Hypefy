"use client";

import Link from "next/link";
import { Music } from "lucide-react";
import { useIsPlaying, type Track } from "@/lib/music";
import { soundHref } from "@/components/music/SoundPill";

/**
 * The sound, as a record in its case, at the foot of the reel's rail under
 * the three dots. Where every short-video app keeps it, so it is where a
 * thumb goes looking: tap it for the sound's page.
 *
 * The disc stays round inside the squircle case because it is a record —
 * filling the case with the square cover made it read as a thumbnail, which
 * is the one thing it is not. It turns while the song is playing and holds
 * its angle when it stops, rather than snapping back to the top.
 *
 * It does not expand. The name is already beside the caption, and a Shot has
 * no room to slide a title across the video it is sitting on.
 *
 * A song shows its artwork; original audio shows the music glyph.
 */
export function SoundBox({ track, size = 36 }: { track: Track; size?: number }) {
  const playing = useIsPlaying(track.id);
  const disc = Math.round(size * 0.72);
  return (
    <Link
      href={soundHref(track.id)}
      prefetch={false}
      data-sound-box
      aria-label={`Sound: ${track.title}${track.artist ? ` by ${track.artist}` : ""}`}
      onClick={(e) => e.stopPropagation()}
      className="flex shrink-0 items-center justify-center overflow-hidden border-2 border-white/85 bg-black/50 transition-transform active:scale-90"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      <span
        data-sound-disc
        className={`block overflow-hidden rounded-full bg-elevated motion-reduce:animate-none ${
          playing ? "animate-[spin_4s_linear_infinite]" : ""
        }`}
        style={{ width: disc, height: disc }}
      >
        {track.artwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.artwork} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-white">
            <Music size={Math.round(size * 0.4)} />
          </span>
        )}
      </span>
    </Link>
  );
}
