import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Your interactions: what you hyped, said, watched and rehyped.
 *
 * There was no way to find a post again after hyping it unless you had also
 * saved it, no list of your own comments, and nothing at all for what you
 * had watched. This is that record, and it is yours alone — every query here
 * carries your own id, and the row rules would refuse anything else.
 *
 * What has since been archived, deleted or made private simply is not in the
 * answer: the join finds nothing and the row drops out. That is the right
 * behaviour, not a gap — a history should not be a way back to something
 * someone has taken down.
 */

export const ACTIVITY_TABS = ["hypes", "comments", "watched", "rehypes"] as const;
export type ActivityTab = (typeof ACTIVITY_TABS)[number];

export function isActivityTab(v: unknown): v is ActivityTab {
  return typeof v === "string" && (ACTIVITY_TABS as readonly string[]).includes(v);
}

/** How far back each list reaches. */
export const ACTIVITY_LIMIT = 90;

/** One post or Shot in a list, however it got there. */
export type ActivityItem = {
  kind: "post" | "shot";
  id: string;
  caption: string | null;
  /** A post's first image, or a Shot's poster. */
  thumb: string | null;
  /** A Shot with no poster shows its own first frame instead. */
  media_url: string | null;
  /** When you hyped, watched or rehyped it. */
  at: string;
};

export type ActivityComment = {
  id: string;
  body: string;
  /** Where the comment is: the post or Shot it was left on. */
  href: string;
  on: "post" | "Shot";
  at: string;
};

type Db = Pick<SupabaseClient, "from">;
const one = <T,>(v: unknown): T | null => ((Array.isArray(v) ? v[0] : v) as T | null) ?? null;

type PostRow = { id: string; image_url: string | null; image_urls: string[] | null; caption: string | null; body: string | null };
type ShotRow = { id: string; media_url: string | null; poster_url: string | null; caption: string | null };

export const ACTIVITY_POST_COLS = "id, image_url, image_urls, caption, body";
export const ACTIVITY_SHOT_COLS = "id, media_url, poster_url, caption";

/** A joined post, as a list item. Null when the post is no longer there to see. */
export function postItem(raw: unknown, at: string): ActivityItem | null {
  const p = one<PostRow>(raw);
  if (!p?.id) return null;
  return {
    kind: "post",
    id: p.id,
    caption: p.caption?.trim() || p.body?.trim() || null,
    thumb: p.image_urls?.[0] ?? p.image_url ?? null,
    media_url: null,
    at,
  };
}

/** A joined Shot, as a list item. Null when the Shot is no longer there to see. */
export function shotItem(raw: unknown, at: string): ActivityItem | null {
  const s = one<ShotRow>(raw);
  if (!s?.id) return null;
  return {
    kind: "shot",
    id: s.id,
    caption: s.caption?.trim() || null,
    thumb: s.poster_url ?? null,
    media_url: s.media_url ?? null,
    at,
  };
}

/** Two lists of items into one, newest first. */
export function newestFirst(...lists: (ActivityItem | null)[][]): ActivityItem[] {
  return lists
    .flat()
    .filter((i): i is ActivityItem => i !== null)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

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

/* ── What you hyped ───────────────────────────────────────────────────────── */

export async function loadHyped(supabase: Db, userId: string): Promise<ActivityItem[]> {
  const { data: hypes } = await supabase
    .from("hypes")
    .select("target_type, target_id, created_at")
    .eq("user_id", userId)
    .in("target_type", ["post", "shot"])
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_LIMIT);

  const rows = (hypes ?? []) as { target_type: string; target_id: string; created_at: string }[];
  const whenById = new Map(rows.map((r) => [r.target_id, r.created_at]));
  const postIds = rows.filter((h) => h.target_type === "post").map((h) => h.target_id);
  const shotIds = rows.filter((h) => h.target_type === "shot").map((h) => h.target_id);

  const [posts, shots] = await Promise.all([
    postIds.length
      ? supabase.from("posts").select(ACTIVITY_POST_COLS).in("id", postIds).is("removed_at", null)
      : Promise.resolve({ data: [] }),
    shotIds.length
      ? supabase.from("shots").select(ACTIVITY_SHOT_COLS).in("id", shotIds).is("removed_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  return newestFirst(
    ((posts.data ?? []) as PostRow[]).map((p) => postItem(p, whenById.get(p.id) ?? "")),
    ((shots.data ?? []) as ShotRow[]).map((s) => shotItem(s, whenById.get(s.id) ?? "")),
  );
}

/* ── What you said ────────────────────────────────────────────────────────── */

export async function loadComments(supabase: Db, userId: string): Promise<ActivityComment[]> {
  const { data } = await supabase
    .from("comments")
    .select("id, body, post_id, shot_id, created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_LIMIT);

  return ((data ?? []) as CommentRow[]).flatMap((c) => {
    const row = toActivityComment(c);
    return row ? [row] : [];
  });
}

/* ── What you watched ─────────────────────────────────────────────────────── */

export async function loadWatched(supabase: Db, userId: string): Promise<ActivityItem[]> {
  const [posts, shots] = await Promise.all([
    supabase
      .from("post_views")
      .select(`created_at, posts(${ACTIVITY_POST_COLS})`)
      .eq("viewer_id", userId)
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_LIMIT),
    supabase
      .from("shot_views")
      .select(`created_at, shots(${ACTIVITY_SHOT_COLS})`)
      .eq("viewer_id", userId)
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_LIMIT),
  ]);

  return newestFirst(
    ((posts.data ?? []) as { created_at: string; posts: unknown }[]).map((r) => postItem(r.posts, r.created_at)),
    ((shots.data ?? []) as { created_at: string; shots: unknown }[]).map((r) => shotItem(r.shots, r.created_at)),
  );
}

/* ── What you rehyped ─────────────────────────────────────────────────────── */

export async function loadRehyped(supabase: Db, userId: string): Promise<ActivityItem[]> {
  const [posts, shots] = await Promise.all([
    supabase
      .from("reposts")
      .select(`created_at, posts(${ACTIVITY_POST_COLS})`)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_LIMIT),
    supabase
      .from("shot_reposts")
      .select(`created_at, shots(${ACTIVITY_SHOT_COLS})`)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_LIMIT),
  ]);

  return newestFirst(
    ((posts.data ?? []) as { created_at: string; posts: unknown }[]).map((r) => postItem(r.posts, r.created_at)),
    ((shots.data ?? []) as { created_at: string; shots: unknown }[]).map((r) => shotItem(r.shots, r.created_at)),
  );
}

/** One tab's worth. The screen asks for the tab that is open and no more. */
export async function loadActivityTab(
  supabase: Db,
  userId: string,
  tab: ActivityTab,
): Promise<{ items: ActivityItem[]; comments: ActivityComment[] }> {
  if (tab === "comments") return { items: [], comments: await loadComments(supabase, userId) };
  const items =
    tab === "watched"
      ? await loadWatched(supabase, userId)
      : tab === "rehypes"
        ? await loadRehyped(supabase, userId)
        : await loadHyped(supabase, userId);
  return { items, comments: [] };
}
