import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostTile } from "@/components/feed/PostTileGrid";

/**
 * What you have done on Hypefy lately: what you hyped, and what you said.
 *
 * There was no way to find a post again after hyping it unless you had also
 * saved it, and no list of your own comments at all. This is that list. It
 * is yours alone: the page reads only rows that carry your id.
 */

export type ActivityShot = {
  id: string;
  user_id: string;
  media_url: string;
  poster_url: string | null;
  caption: string | null;
};

export type ActivityComment = {
  id: string;
  body: string;
  /** Where the comment is: the post or Shot it was left on. */
  href: string;
  on: "post" | "Shot";
  at: string;
};

export type YourActivity = {
  hypedShots: ActivityShot[];
  hypedPosts: PostTile[];
  comments: ActivityComment[];
};

export const ACTIVITY_HYPES = 90;
export const ACTIVITY_COMMENTS = 50;

/** Put rows back in the order their ids were asked for, dropping any that are gone. */
export function inOrder<T extends { id: string }>(ids: string[], rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

type CommentRow = { id: string; body: string | null; post_id: string | null; shot_id: string | null; created_at: string };

/** A comment as the list shows it, or nothing if it has no words or no home. */
export function toActivityComment(c: CommentRow): ActivityComment | null {
  const body = (c.body ?? "").trim();
  if (!body) return null;
  if (c.shot_id) return { id: c.id, body, href: `/shots/${c.shot_id}`, on: "Shot", at: c.created_at };
  if (c.post_id) return { id: c.id, body, href: `/p/${c.post_id}`, on: "post", at: c.created_at };
  return null;
}

type Db = Pick<SupabaseClient, "from">;

export async function loadYourActivity(supabase: Db, userId: string): Promise<YourActivity> {
  const [hypes, comments] = await Promise.all([
    supabase
      .from("hypes")
      .select("target_type, target_id, created_at")
      .eq("user_id", userId)
      .in("target_type", ["post", "shot"])
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_HYPES),
    supabase
      .from("comments")
      .select("id, body, post_id, shot_id, created_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_COMMENTS),
  ]);

  const rows = (hypes.data ?? []) as { target_type: string; target_id: string }[];
  const postIds = rows.filter((h) => h.target_type === "post").map((h) => h.target_id);
  const shotIds = rows.filter((h) => h.target_type === "shot").map((h) => h.target_id);

  const [posts, shots] = await Promise.all([
    postIds.length
      ? supabase.from("posts").select("id, image_url, image_urls, caption, body").in("id", postIds).is("removed_at", null)
      : Promise.resolve({ data: [] }),
    shotIds.length
      ? supabase
          .from("shots")
          .select("id, user_id, media_url, poster_url, caption")
          .in("id", shotIds)
          .is("removed_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    // Most recently hyped first, which is the order they were asked for in.
    hypedPosts: inOrder(postIds, (posts.data ?? []) as PostTile[]),
    hypedShots: inOrder(shotIds, (shots.data ?? []) as ActivityShot[]),
    comments: ((comments.data ?? []) as CommentRow[]).flatMap((c) => {
      const row = toActivityComment(c);
      return row ? [row] : [];
    }),
  };
}
