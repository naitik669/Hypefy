"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { GridPeek } from "@/components/feed/GridPeek";
import { formatCount } from "@/lib/format";
import type { FeedPost } from "@/components/feed/FeedCard";
import { CommentIcon } from "@/components/ui/CommentIcon";

function firstImage(p: FeedPost): string | null {
  return p.image_urls?.[0] ?? p.image_url ?? null;
}

/**
 * Search results as a grid of tiles rather than a column of full post cards.
 *
 * The column rendered a complete FeedCard per result — every one of which
 * mounts a gallery, a pinch layer, a poll block, a music chip and its own
 * queries. Twenty of those is a long wait for a screen whose job is "which of
 * these is the one I meant", a question you answer by looking, not by reading.
 *
 * Holding a tile lifts the whole post, so density costs nothing: the context
 * a card would have given you is one press away.
 */
export function PostResultsGrid({
  posts,
  currentUserId,
}: {
  posts: FeedPost[];
  currentUserId?: string;
}) {
  return (
    // Discover's tile — same 16px rounding, same gradient scrim — at three
    // columns.
    //
    // Tighter gutters than Discover's, though, and that is the point rather
    // than an oversight: at three columns the page margin costs twice what
    // the gutter does, so trimming px-4/gap-3 to px-2/gap-2 buys about 16%
    // more picture per tile without dropping a column. A browse surface can
    // afford to frame a photo; a list of results is answering "which of these
    // is the one I meant", and that is answered by seeing more of them.
    <div className="grid grid-cols-3 gap-2 px-2">
      {posts.map((p) => {
        const img = firstImage(p);
        const profile = p.profiles;
        const hue = profile?.avatar_hue ?? 280;
        return (
          <GridPeek
            key={p.id}
            currentUserId={currentUserId}
            post={{
              id: p.id,
              user_id: p.user_id,
              caption: p.caption ?? p.body ?? null,
              image: img,
              aspect_ratio: p.aspect_ratio ?? null,
              hype_count: p.hype_count ?? 0,
              comment_count: p.comment_count ?? 0,
              author: profile
                ? {
                    id: p.user_id,
                    name: profile.display_name ?? profile.username ?? "Someone",
                    username: profile.username ?? null,
                    avatarUrl: profile.avatar_url ?? null,
                    hue,
                    verified: !!profile.is_verified,
                  }
                : null,
            }}
          >
            <Link
              href={`/p/${p.id}`}
              className="group relative block aspect-square overflow-hidden rounded-2xl bg-surface"
            >
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img}
                  alt={p.caption ?? "Post"}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                // A text post has no picture, and a blank tile in a grid reads
                // as a failed image. Showing the words is both the honest
                // thumbnail and the useful one.
                <div
                  className="flex h-full w-full items-center p-2"
                  style={{
                    background: `linear-gradient(140deg, hsl(${hue} 55% 20%), #141414)`,
                  }}
                >
                  <p className="line-clamp-5 text-[11px] font-medium leading-snug text-white/90">
                    {p.caption ?? p.body ?? ""}
                  </p>
                </div>
              )}

              {(p.hype_count ?? 0) > 0 || (p.comment_count ?? 0) > 0 ? (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2.5 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 text-[10px] font-bold text-white">
                  {(p.hype_count ?? 0) > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Star size={10} className="fill-white" />
                      {formatCount(p.hype_count ?? 0)}
                    </span>
                  )}
                  {(p.comment_count ?? 0) > 0 && (
                    <span className="flex items-center gap-0.5">
                      <CommentIcon size={10} />
                      {formatCount(p.comment_count ?? 0)}
                    </span>
                  )}
                </span>
              ) : null}
            </Link>
          </GridPeek>
        );
      })}
    </div>
  );
}
