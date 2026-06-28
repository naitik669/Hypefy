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
 */
export function feedScore(
  p: { created_at: string; hype_count?: number; comment_count?: number; save_count?: number },
  isOwn: boolean,
  isFollowed: boolean,
  interestMatch: boolean,
  now: number,
): number {
  const hours = (now - new Date(p.created_at).getTime()) / 3_600_000;
  const recency = Math.max(0, 48 - hours) * 2;
  const social = isFollowed ? 44 : isOwn ? 28 : 0;
  const engagement = Math.min(
    (p.hype_count ?? 0) * 3 + (p.comment_count ?? 0) * 2 + (p.save_count ?? 0) * 2,
    60,
  );
  const interest = interestMatch ? 18 : 0;
  return recency + social + engagement + interest;
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
