"use client";

import { useEffect, useRef } from "react";

/**
 * Records that an ad card was actually on screen.
 *
 * The same shape as FeedImpression — a 1px sentinel, half of it visible for
 * the best part of a second, once per session — but it writes nothing to the
 * database. post_views cannot take it (its post_id is a foreign key into
 * posts, which is also why Shots log nothing today), and an ad_views table is
 * not worth a migration until there is a reason to compare fill against reach.
 *
 * What it does drive is the session budget: a slot the reader never scrolls to
 * must not burn one, or a single long feed silently spends the whole day's
 * allowance on cards nobody saw.
 */

const DWELL_MS = 900;

/** Survives card unmount and remount within a session; cleared on reload. */
const seen = new Set<string>();

export function AdImpression({
  adId,
  onSeen,
}: {
  adId: string;
  onSeen: (adId: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Held in a ref so a changed callback identity never restarts the observer
  // and re-runs the dwell clock.
  const cb = useRef(onSeen);
  cb.current = onSeen;

  useEffect(() => {
    if (!adId || seen.has(adId)) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          if (timer) clearTimeout(timer);
          timer = null;
          return;
        }
        if (timer) return;
        timer = setTimeout(() => {
          if (seen.has(adId)) return;
          seen.add(adId);
          io.disconnect();
          cb.current(adId);
        }, DWELL_MS);
      },
      { threshold: 0.5 }
    );

    io.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      io.disconnect();
    };
  }, [adId]);

  return <div ref={ref} aria-hidden className="h-px w-full" />;
}
