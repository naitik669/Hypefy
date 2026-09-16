"use client";

import { useEffect, useRef, useState } from "react";
import { autoplayAllowed } from "@/components/feed/ShotFeedCard";

/**
 * A Shot playing where it sits, silently, in a tile.
 *
 * Discover is a wall of stills, and a still of a video is the one thing on
 * that wall that is lying about what it is. This plays the thing itself —
 * with every one of the same bounds the feed card keeps, because a grid can
 * hold nine of these at once and a grid that decodes nine videos is a phone
 * that gets hot:
 *
 *  - **Only while on screen**, and only a few at a time (see `LIMIT`): the
 *    ones nearest the middle of the screen play and the rest hold their
 *    poster frame.
 *  - **Nothing is fetched** until the tile has been near the viewport once.
 *  - **Muted, always.** Sound belongs to the reel you chose to open.
 *  - **It stands down** for Save-Data and 2g-class connections — those are
 *    somebody's money — and the poster stays put instead.
 *
 * The poster is the video's own `poster`, not an image layered under it, so
 * a video that never starts looks like what it is rather than like a working
 * feature.
 */

/** How many tiles may be playing at once, across the whole page. */
const LIMIT = 4;
/** How much of a tile must be on screen before it is a candidate. */
const RATIO = 0.6;

/**
 * Who is playing, page-wide.
 *
 * A module-level set rather than state: every tile needs to know what every
 * other tile is doing, and threading that through a masonry grid is a prop
 * drilled through three components to answer a question about the DOM.
 */
const playing = new Set<string>();

function mayPlay(id: string): boolean {
  if (playing.has(id)) return true;
  if (playing.size >= LIMIT) return false;
  playing.add(id);
  return true;
}

function release(id: string) {
  playing.delete(id);
}

function autoplayUnwelcome(): boolean {
  if (typeof window === "undefined") return true;
  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  return !autoplayAllowed({
    saveData: conn?.saveData,
    effectiveType: conn?.effectiveType,
  });
}

export function ShotPreview({
  id,
  src,
  poster,
  alt,
  className = "",
}: {
  id: string;
  src: string;
  poster: string | null;
  alt?: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  /** Near the viewport once: from here the video may be fetched. */
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || autoplayUnwelcome()) return;

    const near = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setArmed(true);
          near.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    near.observe(el);

    const watch = new IntersectionObserver(
      ([e]) => {
        const v = ref.current;
        if (!v) return;
        if (e.isIntersecting && e.intersectionRatio >= RATIO) {
          if (!mayPlay(id)) return;
          v.muted = true;
          void v.play().catch(() => release(id));
        } else {
          release(id);
          if (!v.paused) v.pause();
        }
      },
      { threshold: [0, RATIO, 1] },
    );
    watch.observe(el);

    return () => {
      near.disconnect();
      watch.disconnect();
      release(id);
    };
  }, [id]);

  // A backgrounded tab stops firing observers, so a tile would carry on
  // decoding with the phone in a pocket.
  useEffect(() => {
    function onHidden() {
      if (document.visibilityState !== "hidden") return;
      const v = ref.current;
      if (v && !v.paused) v.pause();
      release(id);
    }
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [id]);

  return (
    <video
      ref={ref}
      // #t=0.1 forces a decoded frame for tiles with no poster: preload
      // "metadata" alone is not obliged to produce one, and Safari does not.
      src={poster ? src : `${src}#t=0.1`}
      poster={poster ?? undefined}
      aria-label={alt}
      muted
      loop
      playsInline
      preload={armed ? "metadata" : "none"}
      className={className}
    />
  );
}
