import Link from "next/link";
import { Music } from "lucide-react";
import type { Track } from "@/lib/music";
import { soundHref } from "@/components/music/SoundPill";

/**
 * The sound's cover, as a small rounded square at the foot of the reel's
 * rail, under the three dots. Where every short-video app keeps it, so it is
 * where a thumb goes looking: tap it for the sound's page.
 *
 * A song shows its artwork; original audio shows whose it is.
 */
export function SoundBox({ track, size = 36 }: { track: Track; size?: number }) {
  return (
    <Link
      href={soundHref(track.id)}
      prefetch={false}
      data-sound-box
      aria-label={`Sound: ${track.title}${track.artist ? ` by ${track.artist}` : ""}`}
      onClick={(e) => e.stopPropagation()}
      className="block shrink-0 overflow-hidden border-2 border-white/85 bg-black/50 transition-transform active:scale-90"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      {track.artwork ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.artwork} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-white">
          <Music size={Math.round(size * 0.45)} />
        </span>
      )}
    </Link>
  );
}
