"use client";

import { useEffect, useState } from "react";
import { SoundBox } from "@/components/music/SoundBox";
import type { Track } from "@/lib/music";

/** How long the name stays out before it rolls back into the case. */
const HOLD_MS = 2800;
/** Let the Shot settle before announcing what it sounds like. */
const LEAD_MS = 450;

/**
 * What a Shot sounds like: the record in its window, and its name unrolling
 * out of it.
 *
 * The name used to be a pill sitting under the caption, which is a second
 * place to look and a second thing to read. It comes out of the disc now
 * and goes back, so the sound has one home on the screen.
 *
 * It unrolls rather than wipes. The ground scales out of the case and the
 * words follow a beat behind it, both on transform and opacity alone — the
 * first attempt animated clip-path, which Android's WebView does not
 * composite, so it repainted every frame and stuttered on the device it
 * mattered on.
 *
 * It is anchored to the case rather than to the screen: absolutely
 * positioned over the case's own box, so it cannot widen the rail it sits
 * in, and nothing has to know where the rail happens to be. It draws over
 * the caption for the couple of seconds it is out, which is the one place it
 * overlaps anything, and it is the rail's z-order that puts it there rather
 * than a guess.
 *
 * It comes out from *behind* the case, not from beside it: the ground runs
 * all the way under the disc and the case is painted on top of it, so there
 * is no seam and no gap between the two. That is what the padding on the
 * right is for — it keeps the words clear of the disc the ground is tucked
 * under.
 *
 * It introduces itself on arrival, keyed to `active` alone. Keying it to
 * playback as well meant every pause and unpause replayed the whole
 * announcement, which is three seconds of the name sliding out at a person
 * who tapped the screen to make the Shot stop.
 */
export function ShotSound({
  track,
  playing,
  active,
  onActivate,
  expanded,
}: {
  track: Track;
  /** The Shot is running. The disc turns with it, not with the song. */
  playing: boolean;
  /** This is the Shot being looked at: the cue to introduce the sound. */
  active: boolean;
  /** What pressing the disc opens — on a Shot, the sound's own menu. */
  onActivate?: () => void;
  /** Whether that menu is open. */
  expanded?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  /**
   * Derived rather than stored, so leaving the Shot hides the name without
   * an effect reaching for setState to put it back.
   */
  const open = revealed && active;

  useEffect(() => {
    if (!active) return;
    // Cleared first, and in a timer rather than in the effect body: a Shot
    // left in the middle of its reveal keeps `revealed` true, and coming
    // back to it would otherwise flash the name out with no roll.
    const reset = setTimeout(() => setRevealed(false), 0);
    // Introduced once per Shot, on arrival. Swiping to the next one is what
    // asks again; nothing repeats while you sit on the same Shot.
    const out = setTimeout(() => setRevealed(true), LEAD_MS);
    const back = setTimeout(() => setRevealed(false), LEAD_MS + HOLD_MS);
    return () => {
      clearTimeout(reset);
      clearTimeout(out);
      clearTimeout(back);
    };
  }, [active, track.id]);

  const ease = "cubic-bezier(.22,1,.36,1)";

  return (
    <div className="relative">
      {/* Over the case's own box, so the rail's width never changes, and
          under it, so the ground disappears behind the disc. */}
      <div className="pointer-events-none absolute right-0 top-1/2 z-0 -translate-y-1/2">
        <div className="relative flex h-8 max-w-[216px] items-center whitespace-nowrap pl-3 pr-12 text-[11px] text-white">
          {/* The ground, growing out of the case. */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-[11px] border border-white/20 bg-black/55 backdrop-blur-md will-change-transform motion-reduce:transition-none"
            style={{
              transform: open ? "scaleX(1)" : "scaleX(0)",
              transformOrigin: "100% 50%",
              transition: `transform 320ms ${ease}`,
            }}
          />
          {/* The words, a beat behind it. The delay is what sells the roll;
              arriving together reads as one box appearing. */}
          <span
            className="relative truncate will-change-transform motion-reduce:transition-none"
            style={{
              opacity: open ? 1 : 0,
              transform: open ? "none" : "translateX(10px)",
              transition: `opacity 160ms ease ${open ? "70ms" : "0ms"}, transform 300ms ${ease} ${
                open ? "70ms" : "0ms"
              }`,
            }}
          >
            <span className="font-semibold">{track.title}</span>
            {track.artist && <span className="text-white/70"> · {track.artist}</span>}
          </span>
        </div>
      </div>

      {/* On top of the ground, which is what makes the ground look tucked
          in behind it rather than butted up against it. */}
      <span className="relative z-10 block">
        <SoundBox track={track} spinning={playing} onActivate={onActivate} expanded={expanded} />
      </span>
    </div>
  );
}
