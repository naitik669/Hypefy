"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { formatCount } from "@/lib/format";
import type { ShotCard } from "@/lib/feed-mix";

/**
 * A Shot, sitting in the post feed.
 *
 * Presentational only — no hooks, no Supabase client, no state. That is not
 * minimalism for its own sake: it is what keeps shot ids out of FeedList's
 * post-keyed batch queries (`hypes.target_id`, `saved_posts.post_id`) and out
 * of `initialHyped`/`initialSaved`.
 *
 * Three things it deliberately does NOT do:
 *
 *  - **It does not autoplay.** No autoPlay, no preload="auto", no observer
 *    driving playback. Video in a scrolling list costs battery and data on
 *    every card the reader passes, most of which they never watch. The
 *    <video> branch exists only for Shots uploaded before posters were
 *    captured, and preload="metadata" fetches headers, not the stream.
 *  - **It does not render FeedImpression.** post_views.post_id has a hard
 *    foreign key to posts(id), so logging a shot there is a guaranteed
 *    failing insert on every card.
 *  - **It carries no hype/save/comment buttons.** Counts are static text; the
 *    real controls live in ReelsFeed, one tap away.
 *
 * Tapping routes to /shots/[shotId], which already exists and already opens
 * ReelsFeed at the chosen shot. prefetch is off — prefetching a video route
 * from every shot card on screen is precisely the cost this card avoids.
 */
export function ShotFeedCard({ shot }: { shot: ShotCard }) {
  const name =
    shot.profiles?.display_name ?? shot.profiles?.username ?? "Someone";
  const username = shot.profiles?.username;
  const hypes = shot.hype_count ?? 0;
  const comments = shot.comment_count ?? 0;

  return (
    <article className="relative border-b border-border/50 pb-3">
      {/* Header mirrors FeedCard's so a Shot reads as feed furniture rather
          than as an interruption. */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar
          name={name}
          hue={shot.profiles?.avatar_hue ?? 280}
          src={shot.profiles?.avatar_url ?? undefined}
          size={40}
        />
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="truncate text-sm font-semibold">{name}</span>
          {username && (
            <span className="truncate text-xs text-faint">@{username}</span>
          )}
        </div>
        <span className="flex items-center gap-1 rounded-pill bg-surface px-2 py-0.5 text-[10px] font-black tracking-wide text-muted">
          <Play size={9} fill="currentColor" /> SHOT
        </span>
      </div>

      <Link
        href={`/shots/${shot.id}`}
        prefetch={false}
        aria-label={`Play ${name}'s Shot`}
        /* 4:5, not the Shot's native 9:16. A true 9:16 tile is about 1.7
           viewports tall on a phone — one Shot would fill the screen and the
           feed would stop being a feed. This is the same shape band FeedCard
           uses for its gallery, so the two sit together. */
        className="relative mx-4 block aspect-[4/5] overflow-hidden rounded-2xl bg-black"
      >
        {shot.poster_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shot.poster_url}
            alt={shot.caption ?? "Shot"}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <video
            src={shot.media_url}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        )}

        {/* Scrim so the play glyph and caption stay legible on a bright frame */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />

        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <Play size={26} className="ml-1" fill="currentColor" />
          </span>
        </span>

        {(hypes > 0 || comments > 0) && (
          <span className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 text-[11px] font-semibold text-white/90">
            {hypes > 0 && <span>{formatCount(hypes)} hypes</span>}
            {comments > 0 && <span>{formatCount(comments)} comments</span>}
          </span>
        )}
      </Link>

      {shot.caption && (
        <p className="line-clamp-2 px-4 pt-2 text-sm leading-snug text-foreground/85">
          {shot.caption}
        </p>
      )}
    </article>
  );
}
