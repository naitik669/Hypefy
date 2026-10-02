"use client";

import { useState } from "react";
import Link from "next/link";
import { ShareAuthor, type SharedShotAuthor } from "@/components/messages/SharedShotCard";

/** Wider than a shared Shot: a post is usually a square or a landscape. */
export const POST_CARD_W = 184;
/** Tallest a photo post gets in a chat: the feed's own 4:5. */
const TALLEST = 4 / 5;
/** Widest: 16:9. Past that a panorama becomes a strip. */
const WIDEST = 16 / 9;

/**
 * The card's shape for a photo post, as width over height.
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
 * A post shared into a chat, in the same style as a shared Shot: the picture
 * at its own shape and the author along the bottom. Where a Shot has the bolt
 * in its corner, a post with several pictures has a stack mark there, and a
 * post with one has nothing — it needs no badge to be a post.
 *
 * A post with no picture used to shrink to a username and two grey lines.
 * It is its words now, set large on the author's colour.
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

  if (!image) {
    return (
      <Link
        href={`/p/${post.id}`}
        {...linkProps}
        aria-label={`Post by ${name}`}
        className="relative block overflow-hidden rounded-2xl"
        style={{ width: POST_CARD_W, aspectRatio: "4 / 5", background: `hsl(${hue} 45% 24%)` }}
      >
        <p className="line-clamp-6 px-3 pt-3 text-[15px] font-semibold leading-snug text-white">
          {post.caption}
        </p>
        <ShareAuthor author={author} name={name} fade={false} />
      </Link>
    );
  }

  return (
    <Link
      href={`/p/${post.id}`}
      {...linkProps}
      aria-label={`Post by ${name}`}
      className="relative block overflow-hidden rounded-2xl bg-surface"
      style={{ width: POST_CARD_W, aspectRatio: String(ratio) }}
    >
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
          className="absolute right-2.5 top-2.5 fill-white drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.5)]"
        >
          <path d="M8 2h11a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z" />
          <path d="M3 7.5v11A3.5 3.5 0 0 0 6.5 22h11" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}

      <ShareAuthor author={author} name={name} />
    </Link>
  );
}
