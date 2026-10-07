import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Everything on Hypefy under one hashtag.
 *
 * A tag used to open Search with the tag typed in: it worked, but there was
 * no page to follow, share or come back to. Tags are stored on posts and
 * Shots as lowercase words without the #, so that is the form everything
 * here works in.
 */

export type TagShot = {
  id: string;
  user_id: string;
  media_url: string;
  poster_url: string | null;
  caption: string | null;
};

export type TagPost = {
  id: string;
  user_id: string;
  image_url: string | null;
  image_urls: string[] | null;
  caption: string | null;
  body: string | null;
  hype_count: number;
};

export type TagPage = {
  tag: string;
  shots: TagShot[];
  /** The most hyped few, when there are enough posts for that to mean something. */
  top: TagPost[];
  recent: TagPost[];
  shotCount: number;
  postCount: number;
};

export const TAG_PAGE_SIZE = 60;
const TOP_COUNT = 3;
/** Below this many posts, "Top" would just be most of the page said twice. */
const TOP_NEEDS = 7;

/** The page for one tag. */
export function tagHref(tag: string): string {
  return `/tag/${encodeURIComponent(tag.replace(/^#/, "").toLowerCase())}`;
}

/** A tag from a link, in the form it is stored in, or null if it is not one. */
export function cleanTag(raw: string): string | null {
  let tag: string;
  try {
    tag = decodeURIComponent(raw);
  } catch {
    return null;
  }
  tag = tag.trim().replace(/^#/, "").toLowerCase();
  if (!tag || tag.length > 60) return null;
  // Letters and digits of any script, and the underscore: what a hashtag is.
  // Marks too: in Hindi and many other scripts a vowel is a mark on the
  // letter before it, and a tag without them is not the word.
  if (!/^[\p{L}\p{M}\p{N}_]+$/u.test(tag)) return null;
  return tag;
}

/** Split posts into the most hyped few and the rest, newest first. */
export function splitTop(posts: TagPost[]): { top: TagPost[]; recent: TagPost[] } {
  if (posts.length < TOP_NEEDS) return { top: [], recent: posts };
  const top = [...posts]
    .filter((p) => p.hype_count > 0)
    .sort((a, b) => b.hype_count - a.hype_count)
    .slice(0, TOP_COUNT);
  const taken = new Set(top.map((p) => p.id));
  return { top, recent: posts.filter((p) => !taken.has(p.id)) };
}

type Db = Pick<SupabaseClient, "from">;

/**
 * What is under this tag that the person asking may see. Never null for a
 * well-formed tag: a tag nobody has used yet is still a tag, and its page
 * says so and lets it be followed.
 */
export async function findTag(supabase: Db, rawTag: string): Promise<TagPage | null> {
  const tag = cleanTag(rawTag);
  if (!tag) return null;

  const [shots, posts] = await Promise.all([
    supabase
      .from("shots")
      .select("id, user_id, media_url, poster_url, caption", { count: "exact" })
      .contains("hashtags", [tag])
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(TAG_PAGE_SIZE),
    supabase
      .from("posts")
      .select("id, user_id, image_url, image_urls, caption, body, hype_count", { count: "exact" })
      .contains("hashtags", [tag])
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(TAG_PAGE_SIZE),
  ]);

  const shotRows = (shots.data ?? []) as TagShot[];
  const postRows = ((posts.data ?? []) as TagPost[]).map((p) => ({ ...p, hype_count: p.hype_count ?? 0 }));

  return {
    tag,
    shots: shotRows,
    ...splitTop(postRows),
    shotCount: shots.count ?? shotRows.length,
    postCount: posts.count ?? postRows.length,
  };
}
