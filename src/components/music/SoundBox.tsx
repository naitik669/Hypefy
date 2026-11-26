"use client";

import Link from "next/link";
import { Music } from "lucide-react";
import { useIsPlaying, type Track } from "@/lib/music";
import { soundHref } from "@/components/music/SoundPill";

/**
 * What a Shot sounds like: a CD turning on a black sleeve, at the foot of
 * the reel's rail. Where every short-video app keeps it, so it is where a
 * thumb goes looking.
 *
 * A CD on a sleeve rather than a record behind a window. The earlier version
 * covered the artwork with a plate and left a hole showing, which was meant
 * to read as a machine with a record caged behind it. On a 44px button it
 * read as a dark blob with a bright dot in it, and nobody saw a disc. So the
 * disc is now the whole of what you see: the artwork is printed on it edge
 * to edge, a clear hub sits in the middle, and the black square behind is a
 * sleeve rather than a case with a window in it.
 *
 * The sheen and the glare do NOT turn with the disc. That is the thing that
 * makes it read as a CD rather than as a spinning picture: on a real disc
 * the rainbow is the light, so it stays where the light is while the disc
 * goes round underneath it.
 *
 * It turns with the Shot, not with the song. That distinction is the whole
 * reason `spinning` exists: a Shot using its own audio has no song playing,
 * so a disc driven by the music would have sat dead still on exactly the
 * Shots that have no other sound attribution. Callers with no Shot behind
 * them fall back to the song, which is right for a shelf of covers.
 *
 * `onActivate` is what a Shot passes: there the disc is also the way into
 * the Shot's menu (ShotSoundMenu), so it is a button that opens that rather
 * than a link straight to the sound's page — the menu carries the link on.
 * Without it the disc stays a plain link, which is what any other surface
 * wants.
 */
export function SoundBox({
  track,
  size = 44,
  spinning,
  onActivate,
  expanded,
}: {
  track: Track;
  size?: number;
  /** Whether the thing this belongs to is playing. Defaults to the song. */
  spinning?: boolean;
  /** Given: the disc opens this instead of the sound's page. */
  onActivate?: () => void;
  /** Whether what `onActivate` opens is open. */
  expanded?: boolean;
}) {
  const songPlaying = useIsPlaying(track.id);
  const roll = spinning ?? songPlaying;
  /** The sleeve's corner. */
  const radius = Math.round(size * 0.3);
  /** How much sleeve shows around the disc. */
  const inset = Math.max(2, Math.round(size * 0.07));
  /** The clear plastic in the middle, as a share of the disc. */
  const hub = Math.round((size - inset * 2) * 0.38);

  const name = `Sound: ${track.title}${track.artist ? ` by ${track.artist}` : ""}`;

  const face = (
    <>
      {/* The disc. Everything inside it is round; the sleeve behind is not. */}
      <span className="absolute overflow-hidden rounded-full" style={{ inset }}>
        {/* Full-bleed and turning: the artwork is printed on the disc, so
            the motion reads as a record going round rather than as a small
            badge wobbling. */}
        <span
          data-sound-disc
          className={`absolute inset-0 block rounded-full motion-reduce:animate-none ${
            roll ? "animate-[spin_3600ms_linear_infinite]" : ""
          }`}
        >
          {track.artwork ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.artwork} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center rounded-full bg-elevated text-white">
              <Music size={Math.round(size * 0.3)} />
            </span>
          )}
        </span>

        {/* The rainbow a disc throws. Still, and over the artwork: it is the
            light on the plastic, not a mark on the disc. */}
        <span
          aria-hidden
          data-sound-sheen
          className="pointer-events-none absolute inset-0 rounded-full mix-blend-screen"
          style={{
            background:
              "conic-gradient(from 20deg, transparent 0 8%, rgba(150,255,230,0.42) 13%, rgba(255,160,240,0.42) 19%, transparent 26% 50%, rgba(150,210,255,0.38) 60%, rgba(255,240,160,0.38) 67%, transparent 74%)",
          }}
        />

        {/* The highlight across the top-left, also still. */}
        <span
          aria-hidden
          data-sound-glare
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0) 38%, rgba(255,255,255,0) 72%, rgba(255,255,255,0.12) 100%)",
          }}
        />

        {/* The clear hub, and the hole in the middle of it. */}
        <span
          aria-hidden
          data-sound-hub
          className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: hub,
            height: hub,
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(circle at 50% 50%, rgba(8,8,8,0.95) 0 24%, rgba(226,229,238,0.55) 26% 62%, rgba(255,255,255,0.16) 64% 100%)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.55)",
          }}
        />

        {/* The disc's own edge, which is what separates it from the sleeve. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.55)" }}
        />
      </span>
    </>
  );

  /** The sleeve: black, square-ish, and the same box either way. */
  const sleeve =
    "relative block shrink-0 border border-white/15 bg-black shadow-[0_2px_10px_rgba(0,0,0,0.55)] transition-transform active:scale-90";
  const box = { width: size, height: size, borderRadius: radius } as const;

  if (onActivate) {
    return (
      <button
        type="button"
        data-sound-box
        aria-label={`${name}. More options`}
        aria-haspopup="menu"
        aria-expanded={expanded ?? false}
        onClick={(e) => {
          e.stopPropagation();
          onActivate();
        }}
        className={sleeve}
        style={box}
      >
        {face}
      </button>
    );
  }

  return (
    <Link
      href={soundHref(track.id)}
      prefetch={false}
      data-sound-box
      aria-label={name}
      onClick={(e) => e.stopPropagation()}
      className={sleeve}
      style={box}
    >
      {face}
    </Link>
  );
}
