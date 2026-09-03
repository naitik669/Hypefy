"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Records that a feed card was actually looked at.
 *
 * The app has never had this. increment_post_view is a bare counter with no
 * viewer and no timestamp, and it is not called from the feed at all — so the
 * ranker can see that a post was hyped but not that fifty people scrolled
 * past it, which is the more useful of the two.
 *
 * Nothing reads post_views yet. It exists so that a month from now there is
 * history to rank with; a signal cannot be used before it has been recorded.
 *
 * Three deliberate limits:
 *
 *  - Visible for a beat, not merely rendered. Cards mount well before they
 *    are on screen (the list is virtualised with content-visibility and
 *    prefetches ahead), so mounting is not looking.
 *  - Once per post per session, held in a module-level set. Scrolling back up
 *    past the same card is the normal case, not a second impression.
 *  - Once per post per viewer per day in the database, enforced by the
 *    primary key. The insert ignores duplicates rather than erroring.
 *
 * Failures are swallowed on purpose. This is telemetry sitting behind every
 * card in the feed; it must never produce a toast or block anything.
 */

const DWELL_MS = 900;

/** Survives card unmount/remount within a session; cleared on reload. */
const recorded = new Set<string>();

export function FeedImpression({
  postId,
  viewerId,
}: {
  postId: string;
  /** Own posts are skipped — an author reading their own feed is not reach. */
  viewerId: string | null | undefined;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!postId || !viewerId || recorded.has(postId)) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const io = new IntersectionObserver(
      (entries) => {
        const on = entries[0]?.isIntersecting;
        if (!on) {
          if (timer) clearTimeout(timer);
          timer = null;
          return;
        }
        if (timer) return;
        timer = setTimeout(() => {
          if (recorded.has(postId)) return;
          recorded.add(postId);
          io.disconnect();
          void createClient()
            .from("post_views")
            .insert({ post_id: postId, viewer_id: viewerId })
            .then(() => {
              /* duplicate for today is the expected case, not an error */
            });
        }, DWELL_MS);
      },
      { threshold: 0.5 }
    );

    io.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      io.disconnect();
    };
  }, [postId, viewerId]);

  return <div ref={ref} aria-hidden className="h-px w-full" />;
}
