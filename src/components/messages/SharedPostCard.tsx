"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import type { SharedShotAuthor } from "@/components/messages/SharedShotCard";

/** The whole card, frame included. Wider than a shared Shot: posts are usually square or landscape. */
export const POST_CARD_W = 200;
/** Tallest a photo gets in a chat: the feed's own 4:5. */
const TALLEST = 4 / 5;
/** Widest: 16:9. Past that a panorama becomes a strip. */
const WIDEST = 16 / 9;

/**
 * The photo's shape, as width over height.
 *
 * Posts store their composed shape (posts.aspect_ratio), so this is right on
 * the first frame; a post from before that column existed falls back to its
 * picture's own size once it loads, and to a square until then. Exported for
 * tests.
 */
export function postCardRatio(ratio: number | null | undefined): number {
  if (typeof ratio !== "number" || !(ratio > 0)) return 1;
  return Math.min(Math.max(ratio, TALLEST), WIDEST);
}

export type SharedPost = {
  id: string;
  caption: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  aspect_ratio?: number | null;
};

/**
 * A post shared into a chat, framed: the author along the top, the photo
 * inset with its own rounded corners like a print in a mount, and the caption
 * under it. A post with several photos carries a stack mark on the photo.
 *
 * A post with no photo takes the same frame, with its words set large on the
 * author's colour where the photo would be — it used to shrink to a username
 * and two grey lines.
 */
export function SharedPostCard({
  post,
  author,
  ...linkProps
}: {
  post: SharedPost;
  author: SharedShotAuthor;
} & Omit<React.ComponentProps<typeof Link>, "href">) {
  const image = post.image_urls?.[0] || post.image_url || null;
  const count = post.image_urls?.length ?? (post.image_url ? 1 : 0);
  const [measured, setMeasured] = useState<number | null>(null);
  const ratio = postCardRatio(post.aspect_ratio ?? measured);
  const name = author?.username ?? author?.display_name ?? "Someone";
  const hue = author?.avatar_hue ?? 200;

  return (
    <Link
      href={`/p/${post.id}`}
      {...linkProps}
      aria-label={`Post by ${name}`}
      className="block rounded-[18px] bg-surface p-2"
      style={{ width: POST_CARD_W }}
    >
      <div className="flex min-w-0 items-center gap-2 px-0.5 pb-2 pt-0.5">
        <Avatar name={name} hue={hue} size={22} src={author?.avatar_url ?? undefined} className="shrink-0" />
        <span className="truncate text-[13px] font-semibold">{name}</span>
      </div>

      {image ? (
        <div className="relative overflow-hidden rounded-[11px] bg-black" style={{ aspectRatio: String(ratio) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={post.caption ?? ""}
            draggable={false}
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
              if (w > 0 && h > 0) setMeasured(w / h);
            }}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {count > 1 && (
            // Two squares, one behind the other: there is more than this one.
            <svg
              viewBox="0 0 24 24"
              width={17}
              height={17}
              aria-label={`${count} photos`}
              className="absolute right-2 top-2 fill-white drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.5)]"
            >
              <path d="M8 2h11a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z" />
              <path d="M3 7.5v11A3.5 3.5 0 0 0 6.5 22h11" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </div>
      ) : (
        <div
          className="flex aspect-[4/5] items-start overflow-hidden rounded-[11px] p-3"
          style={{ background: `hsl(${hue} 45% 24%)` }}
        >
          <p className="line-clamp-6 text-[15px] font-semibold leading-snug text-white">{post.caption}</p>
        </div>
      )}

      {/* The caption under the photo. A words-only post already shows them. */}
      {image && post.caption && (
        <p className="line-clamp-2 px-0.5 pb-0.5 pt-2 text-[12.5px] leading-snug text-foreground/85">
          {post.caption}
        </p>
      )}
    </Link>
  );
}
