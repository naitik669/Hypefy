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

/**
 * The same list with ad slots in it.
 *
 * A separate name rather than a third arm defaulted to `never` on FeedItem —
 * that was the first attempt and it does not work: TypeScript keeps an arm
 * whose payload is `never`, so `item.kind === "shot" ? … : item.post` stopped
 * narrowing and every existing consumer broke. Two types cost one extra line
 * and leave the shots-only path exactly as it was.
 */
export type FeedItemOrAd<P, S, A> = FeedItem<P, S> | { kind: "ad"; ad: A };

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
 * Ads.
 *
 * A second quota pass over the same index space, deliberately kept separate
 * from placeShots rather than folded into it: an ad has no author, so it
 * cannot satisfy placeShots' `user_id` constraint, and loosening that
 * constraint would weaken the same-author nudge above — which exists to undo
 * a real adjacency bug, not as decoration.
 *
 * Because it is a second pass, it has to know where the first one landed.
 * Shots default to 3/6 and ads to 5/8, so both reach slots 11 and 19; two
 * items at the same index come out adjacent, and two one apart come out
 * separated by a single post, which reads just as badly. Hence the gap, and
 * hence shots winning every tie: their positions are pinned by tests, and a
 * content-dependent winner would be untestable.
 */

/** An ad slot. No author, no media — placement is positional only. */
export type AdCard = { id: string; index: number };

/** An ad plus the index it should occupy in the merged list. */
export type PlacedAd = AdCard & { slot: number };

export type AdPlaceOpts = {
  /** First slot an ad may occupy. */
  firstSlot?: number;
  /** Minimum posts between one ad and the next. */
  every?: number;
  /** Hard ceiling on ads produced by this call. */
  max?: number;
  /** Below this many posts, no ads at all. */
  minPosts?: number;
  /** Minimum distance between an ad and any reserved (shot) slot. */
  gap?: number;
  /** Place only at or beyond this index. Pagination appends; it never renumbers. */
  startAfter?: number;
  /** Index of the first ad produced, so ids stay unique across pages. */
  startIndex?: number;
  /** Prefix for generated ids. A refresh passes a new one to mint fresh slots. */
  idPrefix?: string;
};

export const AD_DEFAULTS: Required<Omit<AdPlaceOpts, "startAfter" | "startIndex" | "idPrefix">> =
  {
    // Later than the shots' 3. A Shot in slot 3 already asks the reader to
    // accept something that is not a post; the feed should get to be itself
    // twice over before it asks a second time, for money.
    firstSlot: 5,
    // Rarer than first-party video, on purpose.
    every: 8,
    max: 2,
    // Fewer posts than this and an ad is a noticeable fraction of the feed.
    minPosts: 8,
    // |adSlot - shotSlot| >= 2, so they are never adjacent and never
    // separated by a single lonely post either.
    gap: 2,
  };

export function placeAds(
  postCount: number,
  reservedSlots: readonly number[],
  opts: AdPlaceOpts = {}
): PlacedAd[] {
  const {
    firstSlot,
    every,
    max,
    minPosts,
    gap,
    startAfter,
    startIndex,
    idPrefix,
  } = { ...AD_DEFAULTS, startAfter: 0, startIndex: 0, idPrefix: "ad-", ...opts };

  if (postCount < minPosts) return [];

  const blocked = new Set<number>();
  const reserve = (slot: number) => {
    for (let d = -(gap - 1); d <= gap - 1; d++) blocked.add(slot + d);
  };
  for (const s of reservedSlots) reserve(s);

  const placed: PlacedAd[] = [];
  let cursor = Math.max(firstSlot, startAfter);

  for (let i = 0; i < max; i++) {
    // Nudge forward past a shot, never backward — backward could walk an ad
    // in front of firstSlot. If a whole spacing window is blocked the region
    // is saturated with shots, so abandon this ad rather than let it drift
    // most of the way to where the next one belongs.
    let attempts = 0;
    while (blocked.has(cursor) && attempts < every) {
      cursor += 1;
      attempts += 1;
    }
    if (blocked.has(cursor)) break;

    // Never at or past the end. spliceShots appends an over-slotted shot on
    // purpose, so a ranked first-party shot is never silently swallowed; an
    // ad gets the opposite rule. The last card in the feed sits directly
    // above "You're all caught up", which makes it read as Hypefy's own
    // sign-off — the single worst place an ad can be.
    if (cursor >= postCount) break;

    const index = startIndex + placed.length;
    placed.push({ id: `${idPrefix}${index}`, index, slot: cursor });
    reserve(cursor);
    cursor += every;
  }

  return placed;
}

/**
 * Build the render list from posts, placed shots and placed ads.
 *
 * Slots are positions in the POST array: an item at slot 3 appears after the
 * third post. Shots whose slot lies beyond the posts are appended, so a
 * placement can never silently swallow one. Ads are not — placeAds refuses to
 * slot one past the end, and an over-slotted ad from anywhere else is dropped
 * rather than parked at the bottom of the feed.
 *
 * Within one index the order is shot, then ad, then the post. Nothing should
 * ever share an index given the reservation in placeAds, but the order has to
 * be stated rather than fall out of Map insertion order — otherwise "never two
 * non-posts in a row" is not something a test can assert.
 */
export function spliceFeed<
  P,
  S extends { slot: number },
  A extends { slot: number },
>(posts: P[], shots: readonly S[], ads: readonly A[]): FeedItemOrAd<P, S, A>[] {
  const bySlot = <T extends { slot: number }>(items: readonly T[]) => {
    const map = new Map<number, T[]>();
    for (const item of items) {
      const list = map.get(item.slot);
      if (list) list.push(item);
      else map.set(item.slot, [item]);
    }
    return map;
  };

  const shotSlots = bySlot(shots);
  const adSlots = bySlot(ads);

  const out: FeedItemOrAd<P, S, A>[] = [];
  posts.forEach((post, i) => {
    for (const shot of shotSlots.get(i) ?? []) out.push({ kind: "shot", shot });
    for (const ad of adSlots.get(i) ?? []) out.push({ kind: "ad", ad });
    out.push({ kind: "post", post });
  });

  // Shots slotted at or past the end of the list. Ads deliberately are not.
  for (const [slot, list] of shotSlots) {
    if (slot < posts.length) continue;
    for (const shot of list) out.push({ kind: "shot", shot });
  }

  return out;
}

/** The shots-only case, unchanged. */
export function spliceShots<P, S extends { slot: number }>(
  posts: P[],
  placed: S[]
): FeedItem<P, S>[] {
  return spliceFeed(posts, placed, [] as never[]) as FeedItem<P, S>[];
}
