import { getBlockedIds } from "@hypefy/core/blocked";
import { getFeedExclusions, isQuieted } from "@hypefy/core/feed-quiet";
import { rankBatch } from "@hypefy/core/feed-rank";
import { loadSeen } from "@hypefy/core/feed-seen";

/**
 * The home feed's candidate set, assembled and ranked.
 *
 * The web does this in a server component with about ten parallel queries
 * (src/app/(app)/home/page.tsx). This is the same shape for the core of
 * it, run as the signed-in user through RLS — the native client has no
 * server to do it on, and does not need one, because every one of these
 * reads is one the user is allowed to make.
 *
 * What is SHARED rather than reimplemented is the part that decides what
 * someone sees: `rankBatch` from @hypefy/core/feed-rank, unchanged, plus
 * `getBlockedIds` and `getFeedExclusions`, which are already in core and
 * already take a client. The blueprint's whole claim about a shared core
 * is that a feed on a second client should be a query and a render, not a
 * second ranking. This is the test of that claim.
 *
 * **What the web does and this does not, yet.** Said in full, because a
 * feed that silently ranks differently from the website is the kind of
 * difference nobody can point at:
 *
 *  - **Ads, Ghost Share and the Hypers tab.** Separate surfaces.
 *  - **Shots mixed into the feed** (`placeShots`). Needs the Shots player.
 *  - **Rehypes.** The web pulls recent reposts by people you follow and
 *    resurfaces those posts with `withRehype`. Omitted here, so a rehyped
 *    post ranks by its own age.
 *  - **Affinity and interests.** The web calls `get_affinity` and reads
 *    followed hashtags, then passes both into `feedScore`. `rankBatch`
 *    passes 0 for both — that is rankBatch's own choice, made when it was
 *    written for the web's load-more route, not a shortcut taken here.
 *  - **Seen posts.** `loadSeen` reads the device store, and this app has
 *    not installed one: a synchronous Kv on a phone wants MMKV, a native
 *    module, which would cost a cloud build and stop over-the-air
 *    delivery. So it returns an empty set and the already-seen demotion
 *    does nothing. Deliberately NOT papered over with an in-memory
 *    default — kv.ts's own note explains why that failure mode is worse:
 *    it appears to work for a session and then everything is gone.
 */

/** What the feed needs from a post, and nothing more. */
export const POST_COLUMNS =
  "id, user_id, caption, media_url, media_urls, created_at, hype_count, comment_count, save_count, share_count, hashtags, " +
  "profiles!posts_user_id_fkey(id, display_name, username, avatar_hue, avatar_url, is_verified)";

/** The web's two windows: guaranteed follows, then a wider firehose. */
export const FOLLOWED_LIMIT = 40;
export const GLOBAL_LIMIT = 150;
/** How many follows are spread into an `.in()` filter. See the note below. */
export const FOLLOW_CAP = 2000;

export type FeedProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
  is_verified: boolean | null;
};

export type FeedPost = {
  id: string;
  user_id: string;
  caption: string | null;
  media_url: string | null;
  media_urls: string[] | null;
  created_at: string;
  hype_count: number | null;
  comment_count: number | null;
  save_count: number | null;
  share_count: number | null;
  hashtags: string[] | null;
  profiles: FeedProfile | null;
};

/**
 * Just enough of the client's shape to query with, so this stays testable.
 *
 * Written out rather than typed `any`: the lint ratchet refuses a new
 * `any`, and rightly — the shape below is the whole contract this module
 * needs from supabase-js, so stating it is documentation as much as types.
 * Each builder method returns the builder, and the builder is awaitable,
 * which is exactly how PostgREST's chain behaves.
 */
type Rows = { data: unknown[] | null };

type Builder = PromiseLike<Rows> & {
  select(columns: string): Builder;
  eq(column: string, value: string): Builder;
  in(column: string, values: string[]): Builder;
  order(column: string, options: { ascending: boolean }): Builder;
  limit(count: number): Builder;
};

type Queryable = {
  from(table: string): Builder;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<Rows>;
};

/**
 * PostgREST renders `.in()` as a comma-separated value in a GET URL, so a
 * few thousand follows makes a URL long enough for a proxy to refuse and
 * the feed returns 414 — breaking it specifically for the people who use
 * the app most. The web caps it at 2000 for that reason and says so; the
 * cap is the same here because the limit is the transport's, not the
 * platform's.
 */
async function followingOf(
  supabase: Queryable,
  userId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId)
    .limit(FOLLOW_CAP);
  return new Set(((data ?? []) as { following_id: string }[]).map((r) => r.following_id));
}

/** Supabase returns an embedded row as an object or a one-element array. */
function oneProfile(raw: unknown): FeedProfile | null {
  if (Array.isArray(raw)) return (raw[0] as FeedProfile) ?? null;
  return (raw as FeedProfile) ?? null;
}

export function normalisePost(raw: Record<string, unknown>): FeedPost {
  return { ...(raw as unknown as FeedPost), profiles: oneProfile(raw.profiles) };
}

/**
 * Posts worth showing, newest-and-best first.
 *
 * Exported separately from the queries so a test can run the filtering and
 * the ranking on fixtures. Everything that decides what a person sees is
 * in here; the function above it only fetches.
 */
export function assemble(
  rows: FeedPost[],
  ctx: {
    currentUserId: string;
    following: Set<string>;
    blocked: Set<string>;
    hiddenPosts: Set<string>;
    seen: Set<string>;
    now?: number;
  },
): FeedPost[] {
  /*
   * Keyed by id, which is what dedupes the two windows: they overlap by
   * design, because a followed author's post is in both, and the same row
   * rendered twice is a duplicate card and a React key warning.
   *
   * There WAS a `if (byId.has(post.id)) continue;` above this loop, put
   * there to make the dedupe explicit. Mutation F6 deleted it and nothing
   * failed — correctly, because the Map already does the job and the guard
   * only chose which of two identical rows won. It was dead weight
   * pretending to be a safeguard, which is the same thing kv.ts records
   * about a `has` check it removed for the same reason. Gone, with the
   * dedupe still asserted.
   */
  const byId = new Map<string, FeedPost>();
  for (const post of rows) {
    /*
     * `isQuieted` does both checks — the author being muted and the post
     * being hidden — so it is called with the sets rather than open-coding
     * either. The blocked set already carries the muted ids, because on
     * this screen a muted person is left out exactly as a blocked one is,
     * which is what the web does and says.
     */
    if (
      isQuieted(post, "post", {
        muted: ctx.blocked,
        posts: ctx.hiddenPosts,
        shots: new Set(),
      })
    )
      continue;
    byId.set(post.id, post);
  }
  return rankBatch([...byId.values()], {
    currentUserId: ctx.currentUserId,
    following: ctx.following,
    seen: ctx.seen,
    now: ctx.now,
  });
}

export async function loadFeed(
  supabase: Queryable,
  userId: string,
): Promise<FeedPost[]> {
  const following = await followingOf(supabase, userId);
  // The web guarantees followed authors a slot even when the firehose has
  // scrolled past them, so their window is asked for separately.
  const feedUserIds = [...following, userId];

  const [followed, global, blocked, quiet] = await Promise.all([
    supabase
      .from("posts")
      .select(POST_COLUMNS)
      .in("user_id", feedUserIds)
      .order("created_at", { ascending: false })
      .limit(FOLLOWED_LIMIT),
    supabase
      .from("posts")
      .select(POST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(GLOBAL_LIMIT),
    // A muted person is left out exactly as a blocked one is on this
    // screen, which is what the web does — so they join the same set.
    getBlockedIds(supabase as never),
    getFeedExclusions(supabase as never),
  ]);

  for (const id of quiet.muted) blocked.add(id);

  const rows = [
    ...((followed.data ?? []) as Record<string, unknown>[]),
    ...((global.data ?? []) as Record<string, unknown>[]),
  ].map(normalisePost);

  return assemble(rows, {
    currentUserId: userId,
    following,
    blocked,
    hiddenPosts: quiet.posts,
    seen: loadSeen(),
  });
}
