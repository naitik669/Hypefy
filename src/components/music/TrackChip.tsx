"use client";

import { useEffect, useRef } from "react";
import { Music, Pause, X, ArrowUpRight } from "lucide-react";
import { type Track, playPreview, claimPreview, useIsPlaying } from "@/lib/music";

/**
 * How much of the watched element has to be on screen for its song to play.
 * The observer is told to report at 0 as well, because `isIntersecting` stays
 * true for something only slightly in view — reading that alone restarted the
 * song of the post you were scrolling AWAY from, and never stopped it until
 * it had left the screen completely.
 */
const IN_VIEW = 0.6;

/**
 * The band down the middle of the screen that counts as "you are looking at
 * this". Used when the chip watches a whole post: a post card can easily be
 * taller than the screen, so a fraction of it is no test at all.
 */
const MIDDLE_BAND = "-38% 0px -38% 0px";

/**
 * Compact playable song chip — artwork (spins while playing), title · artist,
 * tap to toggle the 30s preview. `onRemove` renders an X for composer use.
 * `autoPlayInView` starts the preview when it scrolls into view and pauses it
 * when it scrolls away (browsers gate this until the first tap — rejected
 * plays are swallowed, so it simply starts working after that).
 *
 * `watch` is what "into view" is measured against. A feed card passes itself,
 * so the song belongs to the post you are looking at — the chip sits at the
 * bottom of the card, and watching the chip meant the music only started once
 * you had scrolled past the picture, which is not where the post begins.
 */
export function TrackChip({
  track,
  onRemove,
  autoPlayInView = false,
  watch,
  className = "",
}: {
  track: Track;
  onRemove?: () => void;
  autoPlayInView?: boolean;
  /** What has to be on screen for the song to play; the chip itself by default. */
  watch?: React.RefObject<HTMLElement | null>;
  className?: string;
}) {
  const playing = useIsPlaying(track.id);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoPlayInView) return;
    const el = watch?.current ?? rootRef.current;
    if (!el) return;
    const whole = el !== rootRef.current;
    // A claim rather than play-and-pause: the post you scroll to starts its
    // song before the one you left lets go, and letting go then stops only a
    // song that is still this chip's. Otherwise the arriving post's song was
    // cut off by the departing post's pause.
    let release: (() => void) | null = null;
    const obs = new IntersectionObserver(
      ([entry]) => {
        const inView = whole
          ? entry.isIntersecting
          : entry.isIntersecting && entry.intersectionRatio >= IN_VIEW;
        if (inView && !release) release = claimPreview(track);
        else if (!inView && release) {
          release();
          release = null;
        }
      },
      whole ? { rootMargin: MIDDLE_BAND } : { threshold: [0, IN_VIEW] },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      release?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlayInView, track.id, watch]);

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
      {/* Full song on Apple Music — attribution + real listen (feed/anthem chips) */}
      {track.appleUrl && !onRemove && (
        <a
          href={track.appleUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open ${track.title} in Apple Music`}
          className="-mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
        >
          <ArrowUpRight size={13} />
        </a>
      )}
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
