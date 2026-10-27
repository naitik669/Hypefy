"use client";

import Link from "next/link";
import { Music } from "lucide-react";
import { useIsPlaying, type Track } from "@/lib/music";
import { soundHref } from "@/components/music/SoundPill";

/**
 * The sound, as a record turning behind a window, at the foot of the reel's
 * rail under the three dots. Where every short-video app keeps it, so it is
 * where a thumb goes looking: tap it for the sound's page.
 *
 * A window rather than a frame. The disc fills the whole case and a plate
 * over it leaves only a circle showing, so what you see is a record caged
 * behind the front of a machine — not a square of artwork with rounded
 * corners, which is what filling the case with the cover looked like.
 *
 * It turns with the Shot, not with the song. That distinction is the whole
 * reason `spinning` exists: a Shot using its own audio has no song playing,
 * so a disc driven by the music would have sat dead still on exactly the
 * Shots that have no other sound attribution. Callers with no Shot behind
 * them fall back to the song, which is right for a shelf of covers.
 */
export function SoundBox({
  track,
  size = 44,
  spinning,
}: {
  track: Track;
  size?: number;
  /** Whether the thing this belongs to is playing. Defaults to the song. */
  spinning?: boolean;
}) {
  const songPlaying = useIsPlaying(track.id);
  const roll = spinning ?? songPlaying;
  const radius = Math.round(size * 0.32);
  /** The hole in the plate, as a radius from the middle. */
  const window = Math.round(size * 0.34);

  return (
    <Link
      href={soundHref(track.id)}
      prefetch={false}
      data-sound-box
      aria-label={`Sound: ${track.title}${track.artist ? ` by ${track.artist}` : ""}`}
      onClick={(e) => e.stopPropagation()}
      className="relative block shrink-0 overflow-hidden border border-white/25 bg-black/55 backdrop-blur-md transition-transform active:scale-90"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {/* Full-bleed and turning: what shows through the hole is the middle
          of a record, so the motion reads as rotation rather than as a
          small badge wobbling. */}
      <span
        data-sound-disc
        className={`absolute inset-0 block motion-reduce:animate-none ${
          roll ? "animate-[spin_3600ms_linear_infinite]" : ""
        }`}
      >
        {track.artwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.artwork} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center rounded-full bg-elevated text-white">
            <Music size={Math.round(size * 0.34)} />
          </span>
        )}
      </span>

      {/* The plate. Everything outside the hole is covered; the hairline
          around it is what makes the hole read as a hole. */}
      <span
        aria-hidden
        data-sound-plate
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: radius,
          background: `radial-gradient(circle at 50% 50%, transparent 0 ${window}px, rgba(0,0,0,0.72) ${window}px)`,
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.08)`,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border border-white/30"
        style={{ width: window * 2, height: window * 2, transform: "translate(-50%, -50%)" }}
      />
    </Link>
  );
}
