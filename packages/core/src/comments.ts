/**
 * Comment threading, and what counts as a picture in a comment body.
 *
 * Both were exported from the web's CommentsSheet and both are pure, so
 * they are here now that the phone needs the same answers. The threading
 * in particular is not a formatting detail — it decides whether a reply is
 * ever seen by anyone, and two clients disagreeing about that would show
 * different conversations for the same post.
 */

/** The shape threading needs. Each client's own node type extends it. */
export type ThreadNode = {
  readonly id: string;
  readonly parent_id: string | null;
  /** When the post's author put this one at the top. */
  readonly pinned_at: string | null;
};

/**
 * Roots in posting order, with each root's replies attached.
 *
 * Flat in, grouped out — not a tree. The web's note on why is worth
 * keeping: a tree has to be walked and cloned to change one node, which is
 * how a single hype ended up re-rendering a whole thread. A flat array
 * replaces exactly one element and every other node keeps its identity.
 */
export function threadOf<T extends ThreadNode>(
  items: readonly T[],
): { root: T; replies: T[] }[] {
  const byId = new Map(items.map((c) => [c.id, c]));

  /**
   * The top-level comment this one belongs under.
   *
   * Walked all the way up rather than taking parent_id at face value. The
   * thread is one level deep on screen, but nothing stops a reply pointing
   * at another reply — the web's old code nested those a second level down
   * and then rendered only one level, so a reply to a reply was written,
   * stored, and never seen again by anyone.
   *
   * A reply whose parent is missing (deleted, or not in this page) becomes
   * its own root rather than being dropped, for the same reason.
   *
   * **A cycle makes the node its own root**, and that is a fix rather than
   * a port. The web's version broke out of the walk and returned whatever
   * node it had reached, which for a two-node cycle is the OTHER node — so
   * neither was its own root, both were filed as replies to each other,
   * and `roots` came out empty. Every comment in the cycle disappeared,
   * silently, from both clients. Nothing in the schema forbids the cycle;
   * a test for it is what found this.
   */
  function rootOf(c: T): T {
    let cur = c;
    const seen = new Set<string>([cur.id]);
    while (cur.parent_id) {
      const parent = byId.get(cur.parent_id);
      // Parent not in this page, or deleted: this is as far up as we go.
      if (!parent) return cur;
      // A cycle. Showing `c` where it was written beats showing nothing.
      if (seen.has(parent.id)) return c;
      seen.add(parent.id);
      cur = parent;
    }
    return cur;
  }

  const replies = new Map<string, T[]>();
  const roots: T[] = [];

  for (const c of items) {
    const root = rootOf(c);
    if (root.id === c.id) {
      roots.push(c);
      continue;
    }
    const list = replies.get(root.id);
    if (list) list.push(c);
    else replies.set(root.id, [c]);
  }

  /*
   * The pinned one reads first, whenever it was written; everything else
   * keeps the order it was posted in. A stable sort is what preserves
   * that, and both Node and modern browsers guarantee one.
   */
  roots.sort((a, b) => (a.pinned_at ? 0 : 1) - (b.pinned_at ? 0 : 1));
  return roots.map((root) => ({ root, replies: replies.get(root.id) ?? [] }));
}

/**
 * A body that is really a picture, or null.
 *
 * GIFs are stored in the body, which used to be read as "starts with
 * https://" — so a comment that was nothing but a link to a page rendered
 * as a broken image, and a plain link could not be posted at all. It has
 * to LOOK like an image now: one of the GIF hosts the picker uses, or a
 * URL ending in an image extension. Photos do not come through here; they
 * have a column of their own.
 */
export function mediaBody(body: string): string | null {
  const t = body.trim();
  if (!t.startsWith("https://") || /\s/.test(t)) return null;
  const isMedia =
    /^https:\/\/(media[0-9]*\.tenor\.com|c\.tenor\.com|media[0-9]*\.giphy\.com|i\.giphy\.com)\//.test(
      t,
    ) || /\.(gif|png|jpe?g|webp)(\?|#|$)/i.test(t);
  return isMedia ? t : null;
}

/**
 * The longest a comment may be.
 *
 * **This is the database's own number**, from the `comments_body_len`
 * check constraint added in migration 0149 — not a figure chosen here.
 * The first version of this file guessed 500, which would have had the
 * phone refuse comments Postgres accepts and the website posts.
 *
 * The web has no client-side cap at all: its textarea carries no
 * maxLength, so an over-long comment makes the round trip and comes back
 * as a constraint violation. Checking here is therefore an addition rather
 * than a port, and a safe one — it refuses exactly what the database
 * would, in words, before the trip.
 */
export const MAX_COMMENT = 2000;

/**
 * Whether this body can be posted, and why not.
 *
 * The web gates its send button on a non-empty trimmed body, which is the
 * part that is shared. The length check is the addition above, and follows
 * the same reasoning as `signupMissing`: a refusal that says what is wrong
 * beats a disabled button that says nothing.
 */
export function commentProblem(body: string): string | null {
  const t = body.trim();
  if (!t) return "Write something first.";
  if (t.length > MAX_COMMENT) return `Comments are at most ${MAX_COMMENT} characters.`;
  return null;
}
