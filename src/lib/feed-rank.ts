/**
 * Pure feed-ranking helpers, extracted so they can be unit-tested
 * independently of the server component that uses them.
 */

/**
 * Blended home-feed score.
 *  - recency:    up to ~96 pts, decays linearly over 48h
 *  - social:     +44 followed / +28 own / 0 stranger
 *  - engagement: hype*3 + comments*2 + saves*2, capped at 60
 *  - interest:   +18 when the post's hashtags overlap my interests/tags
 *  - author affinity: up to +30 for authors I actually interact with
 *  - tag affinity:    up to +15 for tags I engage with / follow
 *
 * `authorAffinity` and `tagAffinity` are the raw weights from get_affinity
 * (0 when none); both are capped so they enrich rather than dominate.
 */
export function feedScore(
  p: {
    created_at: string;
    hype_count?: number;
    comment_count?: number;
    save_count?: number;
  },
  isOwn: boolean,
  isFollowed: boolean,
  interestMatch: boolean,
  now: number,
  authorAffinity = 0,
  tagAffinity = 0,
  /**
   * Already hyped, commented on, or saved this post.
   *
   * A penalty rather than a filter, deliberately. Hiding interacted posts
   * outright empties the feed for exactly the people who use the app most —
   * the heaviest account here has hyped 31 of 32 posts, which would leave it
   * a feed of one. Demoting keeps the feed full while pushing the familiar
   * down.
   */
  interacted = false,
  /**
   * Already scrolled past this one, from post_views.
   *
   * Distinct from `interacted`: hyping something is a strong statement about
   * it, merely having it on screen is a weak one. Weaker penalty to match —
   * enough to sink a post you have already been shown beneath ones you have
   * not, without burying a followed friend you happened to glance at.
   *
   * They do not stack. Interacting implies seeing, and applying both would
   * push anything you engaged with off the feed entirely.
   */
  seen = false
): number {
  const hours = (now - new Date(p.created_at).getTime()) / 3_600_000;
  const recency = Math.max(0, 48 - hours) * 2;
  const social = isFollowed ? 44 : isOwn ? 28 : 0;
  const engagement = Math.min(
    (p.hype_count ?? 0) * 3 +
      (p.comment_count ?? 0) * 2 +
      (p.save_count ?? 0) * 2,
    60
  );
  const interest = interestMatch ? 18 : 0;
  const authorBoost = Math.min(Math.max(authorAffinity, 0) * 1.5, 30);
  const tagBoost = Math.min(Math.max(tagAffinity, 0) * 1.5, 15);
  // Sized against the scale above: enough to sink a post below fresh
  // unseen ones, not enough to bury a followed friend's new post under a
  // stranger's.
  const seenPenalty = interacted ? 55 : seen ? 25 : 0;
  return (
    recency +
    social +
    engagement +
    interest +
    authorBoost +
    tagBoost -
    seenPenalty
  );
}

/**
 * Small deterministic per-post jitter, so refreshing reshuffles posts that
 * scored close together instead of returning a byte-identical list.
 *
 * Seeded by post id and a caller-supplied bucket, so the order is stable
 * within one refresh — a random() here would reorder mid-render and make
 * React reconcile the wrong rows — but changes when the bucket does.
 *
 * The amplitude is small on purpose: it breaks ties, it does not outrank
 * recency or a followed author.
 */
export function refreshJitter(
  id: string,
  seed: number,
  amplitude = 20
): number {
  let h = seed >>> 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  }
  return ((h % 1000) / 1000) * amplitude;
}

/**
 * A fresh seed for one render.
 *
 * This used to be a wall-clock bucket — Math.floor(now / 3 minutes) — which
 * meant every refresh inside the same three minutes produced the identical
 * seed, the identical jitter and therefore the identical feed. Pulling to
 * refresh and seeing the same post at the top was not a coincidence; it was
 * guaranteed.
 *
 * Random per call is safe here because the seed is drawn ONCE per render and
 * then applied to every post. The thing to avoid is randomness inside the
 * comparison itself, which would reorder mid-sort and break reconciliation.
 */
export function refreshSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/**
 * Sum of affinity weights for a post's tags, given the caller's tag-affinity
 * map (lowercased tag → weight) and the set of tags they follow (each
 * followed tag contributes a flat bonus). Use as the `tagAffinity` arg above.
 */
export function tagAffinityFor(
  p: { hashtags?: string[] | null },
  tagWeights: Record<string, number>,
  followedTags: Set<string> = new Set()
): number {
  let sum = 0;
  for (const t of postTags(p)) {
    sum += tagWeights[t] ?? 0;
    if (followedTags.has(t)) sum += 2;
  }
  return sum;
}

/**
 * Reorder a ranked list so the same author never appears in two consecutive
 * slots when avoidable — keeps one prolific poster from dominating the top.
 */
export function diversify<T extends { user_id: string }>(ranked: T[]): T[] {
  const out: T[] = [];
  const pending = [...ranked];
  while (pending.length) {
    const lastAuthor = out.length ? out[out.length - 1].user_id : null;
    const idx = pending.findIndex((p) => p.user_id !== lastAuthor);
    const pick = idx === -1 ? 0 : idx;
    out.push(pending.splice(pick, 1)[0]);
  }
  return out;
}

/**
 * A Shot's score on the POST scale, so the two can be compared at all.
 *
 * Deliberately a delegation rather than its own formula. `shotScore` in
 * shots/page.tsx tops out around 114 on a tiered recency curve while
 * `feedScore` tops out near 263 — sorting numbers from those two scales in one
 * list is meaningless. That function stays where it is, ranking shots against
 * shots, where the scale does not matter.
 *
 * A Shot carries no hashtags, so it can never earn the interest or tag-affinity
 * terms and is structurally ~33 points short of an otherwise identical post.
 * That is correct and left uncompensated: placement is decided by quota (see
 * feed-mix.ts), so the shortfall changes the ORDER shots are chosen in, never
 * whether they appear.
 *
 * `seen` is not exposed because there is no shot_views table — there is no
 * impression signal for Shots to read.
 */
export function shotFeedScore(
  s: {
    created_at: string;
    hype_count?: number | null;
    comment_count?: number | null;
    save_count?: number | null;
  },
  isOwn: boolean,
  isFollowed: boolean,
  now: number,
  authorAffinity = 0,
  interacted = false
): number {
  return feedScore(
    {
      created_at: s.created_at,
      hype_count: s.hype_count ?? 0,
      comment_count: s.comment_count ?? 0,
      save_count: s.save_count ?? 0,
    },
    isOwn,
    isFollowed,
    false,
    now,
    authorAffinity,
    0,
    interacted,
    false
  );
}

/**
 * Rank a batch fetched by the client, with only what the client actually has.
 *
 * The home feed's first 30 posts are ranked on the server with affinity data
 * from get_affinity; everything after that was appended in pure
 * reverse-chronological order, so the feed silently changed character partway
 * down. This closes that cliff.
 *
 * It is deliberately a weaker ranking, not a pretend-equal one: affinity is a
 * server-only RPC and interests are not shipped to the client, so both terms
 * are passed as zero. What remains — recency, whether you follow the author,
 * engagement, and the seen penalty — is most of the signal and all of the
 * ordering that matters at this corpus size.
 *
 * `interacted` is likewise left false: the client learns hype/save state in a
 * separate round trip AFTER this runs, and delaying the sort to wait for it
 * would trade a visible pause for a marginal reordering.
 */
export function rankBatch<
  T extends {
    id: string;
    user_id: string;
    created_at: string;
    hype_count?: number | null;
    comment_count?: number | null;
    save_count?: number | null;
  },
>(
  batch: T[],
  ctx: {
    currentUserId: string;
    following: Set<string>;
    seen: Set<string>;
    now?: number;
  }
): T[] {
  const now = ctx.now ?? Date.now();
  const scored = batch.map((p) => ({
    p,
    score: feedScore(
      {
        // Coerced because the database columns are nullable while feedScore
        // takes plain numbers. A null count is zero engagement, not unknown.
        created_at: p.created_at,
        hype_count: p.hype_count ?? 0,
        comment_count: p.comment_count ?? 0,
        save_count: p.save_count ?? 0,
      },
      p.user_id === ctx.currentUserId,
      ctx.following.has(p.user_id),
      false,
      now,
      0,
      0,
      false,
      ctx.seen.has(p.id)
    ),
  }));
  scored.sort(
    (a, b) => b.score - a.score || (a.p.created_at < b.p.created_at ? 1 : -1)
  );
  return diversify(scored.map((s) => s.p));
}

/** Lowercased hashtag set from a post, for interest matching. */
export function postTags(p: { hashtags?: string[] | null }): string[] {
  return ((p.hashtags ?? []) as string[]).map((t) =>
    t.replace(/^#/, "").toLowerCase()
  );
}
