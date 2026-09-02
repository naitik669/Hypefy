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
  p: { created_at: string; hype_count?: number; comment_count?: number; save_count?: number },
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
): number {
  const hours = (now - new Date(p.created_at).getTime()) / 3_600_000;
  const recency = Math.max(0, 48 - hours) * 2;
  const social = isFollowed ? 44 : isOwn ? 28 : 0;
  const engagement = Math.min(
    (p.hype_count ?? 0) * 3 + (p.comment_count ?? 0) * 2 + (p.save_count ?? 0) * 2,
    60,
  );
  const interest = interestMatch ? 18 : 0;
  const authorBoost = Math.min(Math.max(authorAffinity, 0) * 1.5, 30);
  const tagBoost = Math.min(Math.max(tagAffinity, 0) * 1.5, 15);
  // Sized against the scale above: enough to sink a post below fresh
  // unseen ones, not enough to bury a followed friend's new post under a
  // stranger's.
  const seenPenalty = interacted ? 55 : 0;
  return recency + social + engagement + interest + authorBoost + tagBoost - seenPenalty;
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
export function refreshJitter(id: string, seed: number, amplitude = 12): number {
  let h = seed >>> 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0);
  }
  return ((h % 1000) / 1000) * amplitude;
}

/** Refresh bucket — changes every few minutes so a pull-to-refresh reorders. */
export function refreshSeed(now: number, minutes = 3): number {
  return Math.floor(now / (minutes * 60_000));
}

/**
 * Sum of affinity weights for a post's tags, given the caller's tag-affinity
 * map (lowercased tag → weight) and the set of tags they follow (each
 * followed tag contributes a flat bonus). Use as the `tagAffinity` arg above.
 */
export function tagAffinityFor(
  p: { hashtags?: string[] | null },
  tagWeights: Record<string, number>,
  followedTags: Set<string> = new Set(),
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

/** Lowercased hashtag set from a post, for interest matching. */
export function postTags(p: { hashtags?: string[] | null }): string[] {
  return ((p.hashtags ?? []) as string[]).map((t) => t.replace(/^#/, "").toLowerCase());
}
