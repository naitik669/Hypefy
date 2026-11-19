import { rows, count } from "../query";
import { isVideoUrl } from "@hypefy/core/video-mime";

/**
 * Activity: what happened, and the still beside each row.
 *
 * **Every select here has an entry in tests/mobile-columns.test.ts**, which is
 * the standing rule since #83 shipped a blank feed by asking for a column
 * that does not exist. The notification itself is cheap; the thumbnails are
 * four more queries, and each one names a different table's picture column.
 *
 * **What the website's Activity has and this does not:**
 *
 *  - **The Tune sheet.** Its switches are read (shownNotifs hides what is
 *    off, so turning something off on the web takes effect here) but not
 *    offered: Settings is not ported, and a sheet that cannot save is worse
 *    than none.
 *  - **Swipe to clear or mute**, and the follow-request Approve/Deny pair.
 *    Both are writes against RPCs this screen does not call yet.
 *  - **Follow back from the row.** The profile is one tap away and has it.
 *  - **The Spotlight question**, which answers a preference.
 *  - **Infinite scroll.** One page of fifty, as the web's first page is.
 */

/** The web's first page. */
export const PAGE = 50;

/** The columns a row reads. */
export const NOTIF_COLUMNS =
  "id, type, target_type, target_id, actor_id, body, is_read, created_at, actor:actor_id(display_name, username, avatar_hue, avatar_url)";

export type NotifActorRow = {
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
};

export type NotifRow = {
  id: string;
  type: string;
  target_type: string | null;
  target_id: string | null;
  actor_id: string | null;
  body: string | null;
  is_read: boolean;
  created_at: string;
  actor: NotifActorRow | null;
  thumb?: { url: string } | null;
  /** Where a comment lives: a comment is not somewhere you can go. */
  parent?: { kind: "post" | "shot"; id: string } | null;
};

type Answer = { data: unknown; error: unknown };
type Counted = { count: number | null; error: unknown };

type Builder = PromiseLike<Answer> & {
  select(columns: string, options?: { count: "exact"; head: true }): Builder;
  eq(column: string, value: string | boolean): Builder;
  in(column: string, values: string[]): Builder;
  order(column: string, options: { ascending: boolean }): Builder;
  limit(count: number): Builder;
  update(values: Record<string, unknown>): Builder;
};

type Queryable = {
  from(table: string): Builder;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<Answer>;
};

function one<T>(raw: unknown): T | null {
  if (Array.isArray(raw)) return (raw[0] as T) ?? null;
  return (raw as T) ?? null;
}

function messageOf(error: unknown): string {
  return error && typeof error === "object" && "message" in error
    ? String((error as { message: unknown }).message)
    : "Something went wrong.";
}

/**
 * The picture for a Shot or a Show: a still, and only a still.
 *
 * The website learned this the hard way. Its square held a video element
 * whose poster was pinned blank to suppress Android's grey play-circle, and
 * a video shows its poster INSTEAD of a frame until it plays, so every Shot
 * row was an empty box. A clip with no cover gets no square at all here,
 * which is what a text post already does and is better than a hole.
 */
export function mediaThumb(
  row: { media_url?: string | null; poster_url?: string | null } | null | undefined,
): { url: string } | null {
  if (!row) return null;
  if (row.poster_url) return { url: row.poster_url };
  // A clip posted before 0213 has no poster and may be either, so the file
  // extension is all there is to go on.
  if (row.media_url && !isVideoUrl(row.media_url)) return { url: row.media_url };
  return null;
}

/** The post picture a row shows: the first of a gallery, else the single one. */
export function postThumb(
  row: { image_url?: string | null; image_urls?: string[] | null } | null | undefined,
): { url: string } | null {
  if (!row) return null;
  const url = row.image_urls?.[0] ?? row.image_url ?? null;
  return url ? { url } : null;
}

export const POST_THUMB_COLUMNS = "id, image_url, image_urls";
export const SHOT_THUMB_COLUMNS = "id, media_url, poster_url";
/**
 * A Show's poster is asked for too. The website's own select stops at
 * media_url, so mediaThumb never sees a poster there and every video Show
 * renders an empty square — while its comment already says posters exist
 * since 0213. Fixed in both rather than copied.
 */
export const SHOW_THUMB_COLUMNS = "id, media_url, poster_url";
export const COMMENT_PARENT_COLUMNS = "id, post_id, shot_id";

/**
 * Resolve the stills, and the parent of any comment.
 *
 * Four queries in parallel, each skipped when nothing on the page needs it —
 * an Activity page of follows asks for nothing extra.
 */
export async function withThumbs(supabase: Queryable, list: NotifRow[]): Promise<NotifRow[]> {
  const idsOf = (targetType: string) =>
    list
      .filter((n) => n.target_type === targetType && n.target_id)
      .map((n) => n.target_id as string);

  const postIds = idsOf("post");
  const shotIds = idsOf("shot");
  const showIds = idsOf("show");
  const commentIds = idsOf("comment");

  const empty: Answer = { data: [], error: null };
  const [postsRes, shotsRes, showsRes, commentsRes] = await Promise.all([
    postIds.length
      ? supabase.from("posts").select(POST_THUMB_COLUMNS).in("id", postIds)
      : Promise.resolve(empty),
    shotIds.length
      ? supabase.from("shots").select(SHOT_THUMB_COLUMNS).in("id", shotIds)
      : Promise.resolve(empty),
    showIds.length
      ? supabase.from("shows").select(SHOW_THUMB_COLUMNS).in("id", showIds)
      : Promise.resolve(empty),
    commentIds.length
      ? supabase.from("comments").select(COMMENT_PARENT_COLUMNS).in("id", commentIds)
      : Promise.resolve(empty),
  ]);

  const postMap = new Map(
    rows<{ id: string; image_url: string | null; image_urls: string[] | null }>(
      postsRes,
      "post pictures",
    ).map((p) => [p.id, postThumb(p)]),
  );
  const shotMap = new Map(
    rows<{ id: string; media_url: string | null; poster_url: string | null }>(
      shotsRes,
      "shot covers",
    ).map((s) => [s.id, mediaThumb(s)]),
  );
  const showMap = new Map(
    rows<{ id: string; media_url: string | null; poster_url: string | null }>(
      showsRes,
      "show covers",
    ).map((s) => [s.id, mediaThumb(s)]),
  );
  const parentMap = new Map<string, { kind: "post" | "shot"; id: string }>();
  for (const c of rows<{ id: string; post_id: string | null; shot_id: string | null }>(
    commentsRes,
    "comment parents",
  )) {
    if (c.post_id) parentMap.set(c.id, { kind: "post", id: c.post_id });
    else if (c.shot_id) parentMap.set(c.id, { kind: "shot", id: c.shot_id });
  }

  return list.map((n) => {
    const id = n.target_id;
    if (!id) return n;
    if (n.target_type === "post") return { ...n, thumb: postMap.get(id) ?? null };
    if (n.target_type === "shot") return { ...n, thumb: shotMap.get(id) ?? null };
    if (n.target_type === "show") return { ...n, thumb: showMap.get(id) ?? null };
    if (n.target_type === "comment") return { ...n, parent: parentMap.get(id) ?? null };
    return n;
  });
}

/** The newest fifty, newest first, with their stills resolved. */
export async function loadNotifs(supabase: Queryable, userId: string): Promise<NotifRow[]> {
  const res = await supabase
    .from("notifications")
    .select(NOTIF_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(PAGE);

  const raw = rows<Omit<NotifRow, "actor"> & { actor: unknown }>(res, "notifications");
  // An embedded join answers with an object or an array depending on how
  // PostgREST read the relationship; both arrive here.
  const mapped: NotifRow[] = raw.map((n) => ({ ...n, actor: one<NotifActorRow>(n.actor) }));
  return withThumbs(supabase, mapped);
}

/** How many are unread, for the bell. */
export async function unreadCount(supabase: Queryable, userId: string): Promise<number> {
  const res = (await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false)) as unknown as Counted;
  return count(res, "unread notifications");
}

/**
 * Mark the ones that were actually fetched.
 *
 * Scoped to ids on purpose. `mark_notifications_read()` takes no arguments
 * and clears EVERY notification on the account — the website used to call it
 * on open, so arriving with three hundred unread silently marked two hundred
 * and fifty of them read without ever rendering one. The badge should clear
 * for what is in front of you and nothing else.
 */
export async function markRead(
  supabase: Queryable,
  ids: string[],
): Promise<{ ok: true } | { error: string }> {
  if (ids.length === 0) return { ok: true };
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .in("id", ids);
  if (error) return { error: messageOf(error) };
  return { ok: true };
}

/**
 * "Read all" — and here it genuinely means all, including what was never
 * loaded. That is what the RPC is for, and why it is a deliberate button
 * rather than something that happens on open.
 */
export async function readAll(supabase: Queryable): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.rpc("mark_notifications_read");
  if (error) return { error: messageOf(error) };
  return { ok: true };
}
