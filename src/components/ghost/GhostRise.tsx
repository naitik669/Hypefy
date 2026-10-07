"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { haptics } from "@/lib/haptics";
import type { GhostKind } from "@/lib/ghost-share";

/** How long the ghost is on screen. Matches the ghost-* animations in globals.css. */
export const GHOST_RISE_MS = 2200;

/**
 * Hyping something that was Ghost Shared to you lets a ghost out.
 *
 * Nothing marks a placed Shot or post while you look at it. This is the one
 * moment it shows: after your hype lands, the app asks the database whether
 * this was placed for you (0121), and on a yes a small ghost rises off the
 * star and fades. It says someone wanted you to see this, and never who.
 *
 * `ask` is called after every hype of anything, so the question gives
 * nothing away about what was hyped. The database answers yes once per
 * placement; hyping it again later is an ordinary hype.
 */
export function useGhostRise(kind: GhostKind, contentId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [rising, setRising] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const ask = useCallback(async () => {
    const { data, error } = await supabase.rpc("ghost_hype_reveal", { p_kind: kind, p_content_id: contentId });
    // No answer is a no: the hype itself already happened and already showed.
    if (error || data !== true) return;
    haptics.select();
    setRising(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRising(false), GHOST_RISE_MS);
  }, [supabase, kind, contentId]);

  return { rising, ask };
}

/**
 * The ghost itself: drawn over the hype star, drifting up and dissolving.
 * Sits inside the star's own box (which is `relative`), like HypeParticles.
 *
 * A shape and nothing else. No eyes, no outline: brightest at the head and
 * fading to nothing at the hem, so it reads as something see-through
 * passing, not as a character. `size` is its width.
 */
export function GhostRise({ size = 22 }: { size?: number }) {
  // Two can be on screen at once (a reel and the card behind it), and a
  // gradient is found by id.
  const fade = useId();
  return (
    <span data-ghost-rise aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="animate-ghost-up absolute">
        <span className="animate-ghost-sway block">
          <span className="animate-ghost-mist block">
            <svg width={size} height={size * 1.2} viewBox="0 0 24 29">
              <defs>
                <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
                  <stop offset="0.55" stopColor="#fff" stopOpacity="0.38" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path fill={`url(#${fade})`} d="M3 13a9 9 0 0 1 18 0v14q-2.25-3-4.5 0t-4.5 0t-4.5 0t-4.5 0z" />
            </svg>
          </span>
        </span>
      </span>
    </span>
  );
}
