"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { soundHref } from "@/components/music/SoundPill";
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
/**
 * The disc in its case, for sitting inside the corner of a picture.
 *
 * A CD in its sleeve: the disc stays round because it is a record, the case
 * around it is the app's squircle, and the title slides out from behind it
 * like the insert and tucks back.
 *
 * The case is no longer the play/pause button. Tapping it shows what is
 * playing; the speaker in the other corner is what stops it. That trade is
 * deliberate — the old tap target sat on top of a photo and silenced the
 * post when someone only meant to read the song's name.
 *
 * The title is an ordinary link and is in the page whether or not it is
 * shown. The reveal is a thing for cursors and thumbs; a keyboard or a
 * screen reader never triggers it, and the song's page has to be reachable
 * all the same.
 */
function OverlayChip({
  track,
  playing,
  rootRef,
  className,
}: {
  track: Track;
  playing: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  /** A cursor on it or focus in it: hold the title out, do not time it out. */
  const held = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const reveal = (autoHide: boolean) => {
    clear();
    setOpen(true);
    if (autoHide && !held.current) timer.current = setTimeout(() => setOpen(false), TITLE_HOLD_MS);
  };
  const tuck = (delay = 0) => {
    clear();
    if (delay) timer.current = setTimeout(() => setOpen(false), delay);
    else setOpen(false);
  };

  // Introduce the song once it actually starts, then tuck back. Tied to
  // playback rather than to being on screen, and claimPreview only ever
  // lets one post own the audio — so a feed of songs is one title sliding
  // out at a time, not twenty.
  useEffect(() => {
    if (!playing) return;
    const inAt = setTimeout(() => reveal(true), 400);
    return () => {
      clearTimeout(inAt);
      clear();
    };
    // reveal and clear are stable for this component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => clear, []);

  /** Already out means the reader has read it; the next tap is the way in. */
  function onCaseClick() {
    if (open) rootRef.current?.querySelector("a")?.click();
    else reveal(true);
  }

  const glass =
    "bg-black/[0.46] backdrop-blur-md border border-white/[0.16]";

  return (
    <div
      ref={rootRef}
      data-sound-stage=""
      data-open={open ? "true" : "false"}
      className={`relative h-9 ${className}`}
      onMouseEnter={() => {
        held.current = true;
        reveal(false);
      }}
      onMouseLeave={() => {
        held.current = false;
        tuck(TITLE_LEAVE_MS);
      }}
    >
      {/* The insert, unrolling out of the case.
          This animated clip-path at first, which Android's WebView does not
          composite: it repainted the whole pill every frame and stuttered on
          the one device it had to look right on. Transform and opacity only
          now — the ground scales out of the case and the words follow a beat
          behind it, which is what makes it read as unrolling rather than as
          a box appearing. */}
      <Link
        href={soundHref(track.id)}
        prefetch={false}
        onClick={(e) => e.stopPropagation()}
        style={{ pointerEvents: open ? "auto" : "none" }}
        className="absolute left-1 top-0 flex h-9 max-w-[220px] items-center whitespace-nowrap pl-[38px] pr-3 text-[11px] text-white"
      >
        <span
          aria-hidden
          className={`absolute inset-0 rounded-[13px] will-change-transform motion-reduce:transition-none ${glass}`}
          style={{
            transform: open ? "scaleX(1)" : "scaleX(0)",
            transformOrigin: "0% 50%",
            transition: `transform 320ms ${UNROLL_EASE}`,
          }}
        />
        <span
          className="relative truncate will-change-transform motion-reduce:transition-none"
          style={{
            opacity: open ? 1 : 0,
            transform: open ? "none" : "translateX(-10px)",
            transition: `opacity 160ms ease ${open ? "70ms" : "0ms"}, transform 300ms ${UNROLL_EASE} ${
              open ? "70ms" : "0ms"
            }`,
          }}
        >
          <span className="font-semibold">{track.title}</span>
          {track.artist && <span className="text-white/70"> · {track.artist}</span>}
        </span>
      </Link>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onCaseClick();
        }}
        onFocus={() => {
          held.current = true;
          reveal(false);
        }}
        onBlur={() => {
          held.current = false;
          tuck();
        }}
        aria-expanded={open}
        aria-label={`Sound: ${track.title}${track.artist ? ` by ${track.artist}` : ""}`}
        className={`absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-[13px] ${glass}`}
      >
        <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-elevated">
          {track.artwork ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={track.artwork}
              alt=""
              className={`h-full w-full object-cover motion-reduce:animate-none ${
                playing ? "animate-[spin_4s_linear_infinite]" : ""
              }`}
            />
          ) : (
            <Music size={12} className="text-accent" />
          )}
        </span>
      </button>
    </div>
  );
}

/** The curve the insert unrolls on: quick out of the case, soft to a stop. */
const UNROLL_EASE = "cubic-bezier(.22,1,.36,1)";

/** How long the title stays out after a tap before tucking back. */
const TITLE_HOLD_MS = 2600;
/** And after the cursor leaves, which is shorter: the reader has moved on. */
const TITLE_LEAVE_MS = 400;

export function TrackChip({
  track,
  onRemove,
  autoPlayInView = false,
  watch,
  overlay = false,
  className = "",
}: {
  track: Track;
  onRemove?: () => void;
  autoPlayInView?: boolean;
  /** What has to be on screen for the song to play; the chip itself by default. */
  watch?: React.RefObject<HTMLElement | null>;
  /**
   * Draw it as a disc in its case, to sit inside the corner of a picture
   * rather than in a row beneath it.
   */
  overlay?: boolean;
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

  if (overlay) {
    return <OverlayChip track={track} playing={playing} rootRef={rootRef} className={className} />;
  }

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
      {onRemove ? (
        <p className="min-w-0 truncate text-[11px] leading-tight">
          <span className="font-semibold">{track.title}</span>
          {track.artist && <span className="text-muted"> · {track.artist}</span>}
        </p>
      ) : (
        // Where it is only being shown, the name is the way to the song's
        // page: what else was made with it, and a way to use it yourself.
        <Link
          href={soundHref(track.id)}

          prefetch={false}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Sound: ${track.title}`}
          className="min-w-0 truncate text-[11px] leading-tight"
        >
          <span className="font-semibold">{track.title}</span>
          {track.artist && <span className="text-muted"> · {track.artist}</span>}
        </Link>
      )}
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
