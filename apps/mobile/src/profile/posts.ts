/**
 * One person's posts, for the grid on their profile.
 *
 * Separate from the feed's loader because it is a different question: no
 * ranking, no follow graph, no blocked set — just this author, newest
 * first, as a grid reads.
 *
 * The one thing it shares with the feed is the soft-delete rule it does
 * NOT need: posts are hard-deleted, so there is no `deleted_at` to filter.
 * Said here because the comments loader does filter one, and the
 * difference looks like an oversight until you know.
 */

/** A grid is three across; four rows is enough to fill a screen and scroll. */
export const GRID_LIMIT = 36;

import { rows } from "../query";

export type GridPost = {
  id: string;
  image_url: string | null;
  image_urls: string[] | null;
  caption: string | null;
  created_at: string;
};

type Rows = { data: unknown[] | null; error: unknown };

type Builder = PromiseLike<Rows> & {
  select(columns: string): Builder;
  eq(column: string, value: string): Builder;
  order(column: string, options: { ascending: boolean }): Builder;
  limit(count: number): Builder;
};

type Queryable = { from(table: string): Builder };

/** What a tile needs: one picture, or the words if there is no picture. */
export const GRID_COLUMNS = "id, image_url, image_urls, caption, created_at";

export function firstMedia(post: {
  image_url: string | null;
  image_urls: string[] | null;
}): string | null {
  return post.image_urls?.[0] ?? post.image_url ?? null;
}

export async function loadUserPosts(
  supabase: Queryable,
  userId: string,
): Promise<GridPost[]> {
  const result = await supabase
    .from("posts")
    .select(GRID_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(GRID_LIMIT);

  return rows<GridPost>(result, "profile posts").map((p) => ({
    ...p,
    // Normalised here so the tile does not have to know about the two
    // columns — image_urls is the gallery, image_url the single picture.
    image_url: firstMedia(p),
  }));
}
