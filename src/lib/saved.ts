/**
 * Saved posts and Shots, as one kind of thing.
 *
 * Shared by the server page (the first screenful) and the client (every page
 * after it), so both read the rows the same way.
 */

export type SavedItem = {
  id: string;
  kind: "post" | "shot";
  /** A real image only. A Shot with no poster has none — see `video`. */
  thumb: string | null;
  /**
   * The Shot's own media, used as the thumbnail when it has no poster. Kept
   * apart from `thumb`: an <img> pointed at an mp4 is a broken image.
   */
  video: string | null;
  caption: string | null;
  /** When you saved it — the order Saved is shown in, and paged by. */
  savedAt: string;
  /** A post with more than one photo. */
  multi: boolean;
};

export type SavedOrder = "newest" | "oldest";

export const SAVED_POST_COLS = "created_at, posts(id, image_url, image_urls, caption)";
export const SAVED_SHOT_COLS = "created_at, shots(id, media_url, poster_url, caption)";

type Row = Record<string, unknown>;
const one = (v: unknown): Row | null => (Array.isArray(v) ? (v[0] as Row) ?? null : (v as Row | null));

/** A saved_posts row with its post, or null if the post has gone. */
export function savedPost(r: Row): SavedItem | null {
  const p = one(r.posts);
  if (!p) return null;
  const urls = Array.isArray(p.image_urls) ? (p.image_urls as string[]) : [];
  return {
    id: p.id as string,
    kind: "post",
    thumb: urls[0] ?? (p.image_url as string | null) ?? null,
    video: null,
    caption: (p.caption as string | null) ?? null,
    savedAt: r.created_at as string,
    multi: urls.length > 1,
  };
}

/** A saved_shots row with its Shot, or null if the Shot has gone. */
export function savedShot(r: Row): SavedItem | null {
  const s = one(r.shots);
  if (!s) return null;
  return {
    id: s.id as string,
    kind: "shot",
    thumb: (s.poster_url as string | null) ?? null,
    video: (s.media_url as string | null) ?? null,
    caption: (s.caption as string | null) ?? null,
    savedAt: r.created_at as string,
    multi: false,
  };
}

/** A search_saved row. */
export function foundItem(r: { kind: string; id: string; thumb: string | null; video: string | null; caption: string | null; saved_at: string }): SavedItem {
  return {
    id: r.id,
    kind: r.kind === "shot" ? "shot" : "post",
    thumb: r.thumb,
    video: r.video,
    caption: r.caption,
    savedAt: r.saved_at,
    multi: false,
  };
}

export const itemKey = (i: Pick<SavedItem, "kind" | "id">) => `${i.kind}:${i.id}`;

/**
 * Posts and Shots as one list, in order — but only as far as both lists are
 * known to reach.
 *
 * Each list is paged on its own. Merge the first page of each naively and a
 * post saved just after the last Shot loaded shows up above Shots that were
 * saved before it, then jumps when the next page arrives. So a list that has
 * more to come caps the merge at its last item: nothing past that point is
 * shown until that list has caught up.
 */
export function mergeSaved(
  posts: SavedItem[],
  shots: SavedItem[],
  order: SavedOrder,
  done: { posts: boolean; shots: boolean }
): SavedItem[] {
  const newest = order === "newest";
  const before = (a: string, b: string) => (newest ? a > b : a < b);
  const horizons = [
    !done.posts && posts.length ? posts[posts.length - 1].savedAt : null,
    !done.shots && shots.length ? shots[shots.length - 1].savedAt : null,
  ].filter((h): h is string => h !== null);
  // The nearer of the two ends: the list that has got less far.
  const horizon = horizons.length ? horizons.reduce((a, b) => (before(a, b) ? a : b)) : null;
  return [...posts, ...shots]
    .filter((i) => horizon === null || i.savedAt === horizon || before(i.savedAt, horizon))
    .sort((a, b) => (a.savedAt === b.savedAt ? 0 : before(a.savedAt, b.savedAt) ? -1 : 1));
}
