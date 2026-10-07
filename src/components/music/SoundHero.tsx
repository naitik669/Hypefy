"use client";

import Link from "next/link";
import { ArrowUpRight, Music, Pause, Play, Plus } from "lucide-react";
import { playPreview, useIsPlaying, useStopPreviewOnUnmount, type Track } from "@/lib/music";

/** The Shot composer, opened with this song already chosen. */
export function composerHrefFor(trackId: string): string {
  return `/create?mode=shot&sound=${encodeURIComponent(trackId)}`;
}

/**
 * The top of a sound's page: what the song is, a way to hear it, and the
 * button the page exists for.
 *
 * Pressing play here is choosing to listen, so it is heard even when the
 * feed is muted (see PlayOpts.audible in lib/music).
 */
export function SoundHero({
  track,
  countLine,
  canCreate,
}: {
  track: Track;
  /** "3 Shots · 1 post" */
  countLine: string;
  /** Signed in: someone who is not gets a way to join instead. */
  canCreate: boolean;
}) {
  const playing = useIsPlaying(track.id);
  useStopPreviewOnUnmount();

  return (
    <section className="flex flex-col gap-4 px-4 pt-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => playPreview(track, { audible: true })}
          aria-label={playing ? "Pause" : `Play ${track.title}`}
          aria-pressed={playing}
          className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-surface"
        >
          {track.artwork ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.artwork} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-accent">
              <Music size={30} />
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white">
            {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 text-xl font-extrabold leading-tight tracking-tight">{track.title}</h1>
          {track.artist && <p className="mt-0.5 truncate text-sm text-muted">{track.artist}</p>}
          {countLine && <p className="mt-1.5 text-xs font-semibold text-faint">{countLine}</p>}
        </div>
      </div>

      <div className="flex gap-2">
        <Link
          href={canCreate ? composerHrefFor(track.id) : "/onboarding"}
          data-use-sound
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-extrabold text-accent-ink transition-transform active:scale-[0.99]"
        >
          <Plus size={17} strokeWidth={2.6} />
          {canCreate ? "Use this sound" : "Join to use this sound"}
        </Link>
        {track.appleUrl && (
          <a
            href={track.appleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 items-center gap-1.5 rounded-2xl border border-border px-4 text-sm font-bold text-foreground"
          >
            Full song
            <ArrowUpRight size={15} />
          </a>
        )}
      </div>
    </section>
  );
}
