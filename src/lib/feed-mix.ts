/**
 * Placing Shots into the post feed.
 *
 * Pure and generic on purpose — no React, no Supabase — so the rules below can
 * be tested directly rather than eyeballed in a running feed.
 *
 * The important decision: **score chooses WHICH shots and in what order; a
 * fixed quota chooses HOW MANY and WHERE.** Merging the two by score has no
 * stable behaviour at this scale. With 5 shots against 31 posts, a fresh shot
 * outranks nearly every post and all five land in the top five; a day later
 * they all fall past rank 30 and vanish completely. No weight constant fixes
 * both ends, because the problem is the size of the corpus, not the weights.
 */

/** A Shot as the feed needs it — a subset of the shots table. */
export type ShotCard = {
  id: string;
  user_id: string;
  media_url: string;
  poster_url: string | null;
  caption: string | null;
  created_at: string;
  hype_count?: number | null;
  comment_count?: number | null;
  profiles: {
    display_name: string | null;
    username: string | null;
    avatar_hue: number | null;
    avatar_url: string | null;
  } | null;
};

/** A shot plus the index it should occupy in the merged list. */
export type PlacedShot<S> = S & { slot: number };

export type FeedItem<P, S> =
  | { kind: "post"; post: P }
  | { kind: "shot"; shot: S };

export type PlaceOpts = {
  /** First slot a shot may occupy. */
  firstSlot?: number;
  /** Minimum posts between one shot and the next. */
  every?: number;
  /** Hard ceiling on shots in this page. */
  max?: number;
};

export const PLACE_DEFAULTS: Required<PlaceOpts> = {
  // Not 0. A shot in the first slot reads as an advert for the Shots tab
  // rather than as the feed; the feed has to open as itself.
  firstSlot: 3,
  // Spacing >= this makes two adjacent shots structurally impossible.
  every: 6,
  max: 3,
};

/**
 * Decide where shots go, given the already-ranked posts.
 *
 * `shots` must arrive in the order you want them used — best first. This
 * function does not score; it only places.
 */
export function placeShots<
  P extends { user_id: string },
  S extends { user_id: string },
>(posts: P[], shots: S[], opts: PlaceOpts = {}): PlacedShot<S>[] {
  const { firstSlot, every, max } = { ...PLACE_DEFAULTS, ...opts };
  if (shots.length === 0) return [];

  // Nothing to interleave into. The thin-feed case is an empty state with a
  // call to action, and one shot floating above it is just noise.
  if (posts.length < firstSlot) return [];

  // Density floor. Without it a 5-post feed becomes 40% video: three shots
  // among five posts is a different product, not a mixed feed.
  const budget = Math.min(max, shots.length, Math.ceil(posts.length / 8));

  const placed: PlacedShot<S>[] = [];
  let slot = firstSlot;

  for (let i = 0; i < budget; i++) {
    if (slot > posts.length) break;

    // diversify() ran over the posts BEFORE shots existed, so splicing can
    // reintroduce the same-author adjacency it just removed. Nudge by one
    // rather than dropping the shot.
    let at = slot;
    if (at > 0 && posts[at - 1]?.user_id === shots[i].user_id) at += 1;

    placed.push({ ...shots[i], slot: at });
    slot = at + every;
  }

  return placed;
}

/**
 * Build the render list from posts and their placed shots.
 *
 * Slots are positions in the POST array: a shot at slot 3 appears after the
 * third post. Shots whose slot lies beyond the posts are appended, so a
 * placement can never silently swallow one.
 */
export function spliceShots<P, S extends { slot: number }>(
  posts: P[],
  placed: S[]
): FeedItem<P, S>[] {
  if (placed.length === 0) return posts.map((post) => ({ kind: "post", post }));

  const bySlot = new Map<number, S[]>();
  for (const s of placed) {
    const list = bySlot.get(s.slot);
    if (list) list.push(s);
    else bySlot.set(s.slot, [s]);
  }

  const out: FeedItem<P, S>[] = [];
  posts.forEach((post, i) => {
    for (const shot of bySlot.get(i) ?? []) out.push({ kind: "shot", shot });
    out.push({ kind: "post", post });
  });

  // Anything slotted at or past the end of the list.
  for (const [slot, shots] of bySlot) {
    if (slot < posts.length) continue;
    for (const shot of shots) out.push({ kind: "shot", shot });
  }

  return out;
}
