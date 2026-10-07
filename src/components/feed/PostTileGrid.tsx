import Link from "next/link";
import { GRID, GRID_WRAP } from "@/components/profile/postGrid";

export type PostTile = {
  id: string;
  image_url: string | null;
  image_urls: string[] | null;
  caption: string | null;
  body: string | null;
};

/**
 * Posts as a grid of squares, three across, each opening the post.
 *
 * The same grid a profile draws, for pages that list posts by something
 * other than their author: a sound, a hashtag. A post with no picture shows
 * its words instead of an empty square.
 */
export function PostTileGrid({ posts }: { posts: PostTile[] }) {
  return (
    <div className={GRID_WRAP} data-post-tiles>
      <div className={GRID}>
        {posts.map((post) => {
          const image = post.image_urls?.[0] ?? post.image_url;
          const words = post.caption ?? post.body ?? "";
          return (
            <Link
              key={post.id}
              href={`/p/${post.id}`}
              aria-label={words ? `Post: ${words}` : "Post"}
              className="relative block overflow-hidden rounded-xl bg-surface"
            >
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center p-2 text-[11px] leading-snug text-muted">
                  <span className="line-clamp-5">{words}</span>
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
