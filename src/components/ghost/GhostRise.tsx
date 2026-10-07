"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ghost } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { haptics } from "@/lib/haptics";
import type { GhostKind } from "@/lib/ghost-share";

/** How long the ghost is on screen. Matches ghost-rise in globals.css. */
export const GHOST_RISE_MS = 1500;

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
 * The ghost itself: drawn over the hype star, drifting up and out.
 * Sits inside the star's own box (which is `relative`), like HypeParticles.
 */
export function GhostRise({ size = 20 }: { size?: number }) {
  return (
    <span data-ghost-rise aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="animate-ghost-rise absolute text-white drop-shadow-[0_1px_6px_rgba(255,255,255,0.45)]">
        <Ghost size={size} fill="currentColor" fillOpacity={0.22} strokeWidth={2} />
      </span>
    </span>
  );
}
