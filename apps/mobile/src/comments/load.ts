import { threadOf, type ThreadNode } from "@hypefy/core/comments";

/**
 * A post's comments, fetched and threaded.
 *
 * The threading itself is `threadOf` from @hypefy/core/comments, shared
 * with the web's sheet — it decides whether a reply is ever seen, and two
 * clients disagreeing about that would show different conversations for
 * the same post.
 *
 * **What the web's sheet does and this does not, yet.** Listed in full,
 * because a comment thread that quietly shows less than the website's is
 * the kind of difference nobody can point at:
 *
 *  - **Paging.** The web loads 30 at a time and fetches more on scroll.
 *    This asks for one page and says when there are more.
 *  - **Replying.** The thread is rendered one level deep, as the web
 *    renders it, but there is no reply composer — so every comment from
 *    the phone is a root. A reply WRITTEN on the web still appears here,
 *    under its root, because the threading is shared.
 *  - **Hyping, editing, deleting, pinning, reporting, forwarding**, the
 *    held-comment menu, GIFs and photos. All of them are writes or sheets
 *    of their own.
 *  - **Mentions and hashtags** are plain text here; the web links them.
 */

/**
 * The web's page size, so "there are more" means the same thing.
 *
 * 100, not 30 — I wrote 30 first and a test against the web's own
 * constant caught it. It matters twice over: a smaller page means the
 * phone claims a thread is truncated when the website shows all of it,
 * and the truncation note would have named the wrong number.
 */
export const PAGE = 100;

export type CommentProfile = {
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
  is_verified: boolean | null;
};

export type Comment = ThreadNode & {
  id: string;
  user_id: string;
  body: string;
  image_url: string | null;
  created_at: string;
  updated_at: string | null;
  pinned_at: string | null;
  parent_id: string | null;
  hype_count: number | null;
  profiles: CommentProfile | null;
};

/**
 * The columns the phone's rows actually read.
 *
 * Narrower than the web's select, which also pulls the four cosmetic
 * columns — is_premium, name_font, name_glow, avatar_decoration. The
 * phone's comment rows do not wear them yet, and on a phone every column
 * crosses a mobile connection.
 */
export const COMMENT_COLUMNS =
  "id, user_id, body, image_url, created_at, updated_at, pinned_at, parent_id, hype_count, " +
  "profiles(display_name, username, avatar_hue, avatar_url, is_verified)";

type Rows = { data: unknown[] | null };

type Builder = PromiseLike<Rows> & {
  select(columns: string): Builder;
  eq(column: string, value: string): Builder;
  is(column: string, value: null): Builder;
  order(column: string, options: { ascending: boolean }): Builder;
  limit(count: number): Builder;
};

type Queryable = {
  from(table: string): Builder;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

/** Supabase returns an embedded row as an object or a one-element array. */
export function normaliseComment(raw: Record<string, unknown>): Comment {
  const profiles = Array.isArray(raw.profiles) ? raw.profiles[0] : raw.profiles;
  return {
    ...(raw as unknown as Comment),
    profiles: (profiles as CommentProfile) ?? null,
  };
}

/**
 * Oldest first, which is the order a conversation is read in.
 *
 * `deleted_at is null` because deleting a comment is a soft delete — the
 * row stays so replies keep their parent. Without the filter a deleted
 * comment reappears here while the website has stopped showing it.
 */
export async function loadComments(
  supabase: Queryable,
  postId: string,
): Promise<{ comments: Comment[]; more: boolean }> {
  const { data } = await supabase
    .from("comments")
    .select(COMMENT_COLUMNS)
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(PAGE);

  const rows = ((data ?? []) as Record<string, unknown>[]).map(normaliseComment);
  return { comments: rows, more: rows.length === PAGE };
}

/** Roots with their replies, from core. */
export function thread(comments: readonly Comment[]) {
  return threadOf(comments);
}

/**
 * Writes a comment and returns its id.
 *
 * The same `create_comment` RPC the web calls, with the same arguments —
 * it is the function that enforces the rate limit and writes the
 * notification, so posting with an insert instead would skip both.
 *
 * `p_owner_id` is the POST's author, not the commenter: it is who gets
 * told. Passing the wrong one sends the notification to the wrong person,
 * which is silent and wrong rather than broken.
 */
export async function createComment(
  supabase: Queryable,
  args: { postId: string; ownerId: string; body: string },
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase.rpc("create_comment", {
    p_post_id: args.postId,
    p_body: args.body,
    p_owner_id: args.ownerId,
  });
  if (error || !data) {
    /*
     * Postgres already names the cause, and the web's own note says why
     * that matters: a rate limit reads very differently from a dead
     * session, and one catch-all sentence made every failure look the
     * same and none of them diagnosable.
     */
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Could not post that.";
    return { error: message };
  }
  return { id: String(data) };
}
