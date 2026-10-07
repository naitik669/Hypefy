import Link from "next/link";
import { Music } from "lucide-react";
import type { Track } from "@/lib/music";

/** The page for one song: everything on Hypefy that uses it. */
export function soundHref(trackId: string): string {
  return `/sound/${encodeURIComponent(trackId)}`;
}

/**
 * The song a Shot was made with, named on the Shot.
 *
 * A Shot's sound used to be invisible: chosen in the composer, saved, and
 * then neither heard nor shown. This is the "shown" half. It opens the
 * sound's page, where the same song can be used for a new Shot.
 *
 * `glass` is for sitting on video (the reel); plain is for a card.
 */
export function SoundPill({
  track,
  glass = false,
  className = "",
}: {
  track: Track;
  glass?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={soundHref(track.id)}
      prefetch={false}
      data-sound-pill
      aria-label={`Sound: ${track.title}${track.artist ? ` by ${track.artist}` : ""}`}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex max-w-full items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs ${
        glass
          ? "bg-black/40 text-white backdrop-blur-sm"
          : "border border-border bg-surface text-foreground"
      } ${className}`}
    >
      <Music size={12} className={glass ? "shrink-0 text-white" : "shrink-0 text-accent"} />
      <span className="min-w-0 truncate">
        <span className="font-semibold">{track.title}</span>
        {track.artist && <span className={glass ? "text-white/70" : "text-muted"}> · {track.artist}</span>}
      </span>
    </Link>
  );
}
