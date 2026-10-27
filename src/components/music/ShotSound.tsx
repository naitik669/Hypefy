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
 * positioned off the case's own left edge, so it cannot widen the rail it
 * sits in, and nothing has to know where the rail happens to be. It draws
 * over the caption for the couple of seconds it is out, which is the one
 * place it overlaps anything, and it is the rail's z-order that puts it
 * there rather than a guess.
 */
export function ShotSound({
  track,
  playing,
  active,
}: {
  track: Track;
  /** The Shot is running. The disc turns with it, not with the song. */
  playing: boolean;
  /** This is the Shot being looked at: the cue to introduce the sound. */
  active: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  /**
   * Derived rather than stored, so leaving the Shot hides the name without
   * an effect reaching for setState to put it back.
   */
  const open = revealed && active && playing;

  useEffect(() => {
    if (!active || !playing) return;
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
  }, [active, playing, track.id]);

  const ease = "cubic-bezier(.22,1,.36,1)";

  return (
    <div className="relative">
      {/* Off the case's own edge, so the rail's width never changes. */}
      <div className="pointer-events-none absolute right-full top-1/2 mr-1.5 -translate-y-1/2">
        <div className="relative flex h-8 max-w-[172px] items-center whitespace-nowrap px-3 text-[11px] text-white">
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

      <SoundBox track={track} spinning={playing} />
    </div>
  );
}
