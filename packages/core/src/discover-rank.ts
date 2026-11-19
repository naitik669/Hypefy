import { postTags, tagAffinityFor } from "./feed-rank";
/**
 * How Discover decides what to show first.
 *
 * Pulled out of discover/page.tsx because it was wrong in a way only
 * arithmetic can show. The old score was
 *
 *     hype*3 + comment*2 + save*2 + share*2 + recencyBoost + boosts
 *
 * with recencyBoost topping out at 20 and the engagement terms **uncapped**.
 * So engagement from any time in history competed directly with being new,
 * and won easily. Measured against production on 15 Nov 2026, with nine
 * Shots in the catalogue:
 *
 *     aman, 10 June, 8 hypes          44 points
 *     chuglimaxxer, 14 Nov, 2 hypes   13 points
 *     chuglimaxxer, 14 Nov, 0 hypes    5 points
 *
 * All four of the newest Shots ranked last of nine, behind Shots from June.
 * In a feed called Discover, which is where a new Shot is meant to be found,
 * the newest were at the bottom.
 *
 * The fix is that engagement decays. A hundred hypes from June says something
 * about June; it should not outrank today. This is the standard shape for a
 * ranked feed and the only honest one: without decay, the oldest popular item
 * is the permanent winner and nothing new is ever discovered.
 *
 * Shared by posts and Shots, as the old score was. "Blowing up" is ranked
 * with it too, which is the right reading of those words — velocity, not an
 * all-time high score.
 */

/** The most engagement any one thing may contribute, before decay. */
export const ENGAGEMENT_CAP = 60;

/** Hours since something was posted. Infinity for an unparseable date. */
export function hoursOld(createdAt: string, now: number): number {
  const at = new Date(createdAt).getTime();
  if (!Number.isFinite(at)) return Infinity;
  return Math.max(0, (now - at) / 3_600_000);
}

/**
 * Engagement, weighted and capped.
 *
 * Capped for the same reason the Shots feed caps it: one runaway post should
 * not own the top of the feed for ever. The Shots feed has used 60 since it
 * was written and this had no cap at all, which is half of why the two
 * disagreed about what was good.
 */
export function engagementOf(x: {
  hype_count?: number | null;
  comment_count?: number | null;
  save_count?: number | null;
  share_count?: number | null;
}): number {
  const n = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? v : 0);
  const raw =
    n(x.hype_count) * 3 + n(x.comment_count) * 2 + n(x.save_count) * 2 + n(x.share_count) * 2;
  return Math.min(raw, ENGAGEMENT_CAP);
}

/**
 * How much of that engagement still counts, by age.
 *
 * Steps rather than a curve, matching the recency tiers below, so the two can
 * be read against each other. Never zero: an old popular thing should sink,
 * not be erased — Discover's pool is small enough that erasing it would leave
 * gaps.
 */
export function ageDecay(hours: number): number {
  if (!Number.isFinite(hours)) return 0.15;
  if (hours < 24) return 1;
  if (hours < 72) return 0.6;
  if (hours < 168) return 0.35;
  return 0.15;
}

/**
 * The bonus for being new.
 *
 * Raised from the old tiers (20/10/5/0). It has to be able to carry a Shot
 * posted today with nothing on it yet past one from June with eight hypes,
 * because that Shot being findable is the entire job of this screen. A week
 * old still earns a little, so the cliff at 72 hours is not a trapdoor.
 */
export function recencyBoost(hours: number): number {
  if (!Number.isFinite(hours)) return 0;
  if (hours < 2) return 30;
  if (hours < 24) return 20;
  if (hours < 72) return 12;
  if (hours < 168) return 4;
  return 0;
}

/**
 * What a post or Shot is worth before the personal boosts are added.
 *
 * The caller adds interest, author-affinity and tag-affinity on top, which
 * are about this reader rather than about the thing.
 */
export function baseScore(
  x: {
    created_at: string;
    hype_count?: number | null;
    comment_count?: number | null;
    save_count?: number | null;
    share_count?: number | null;
  },
  now: number,
): number {
  const hours = hoursOld(x.created_at, now);
  return engagementOf(x) * ageDecay(hours) + recencyBoost(hours);
}

/**
 * The whole Discover score: what a thing is worth, plus what it is worth
 * TO THIS READER.
 *
 * `baseScore` is about the post; the three boosts are about the person
 * looking. They were written inline in the web's Discover page, and are
 * here now that the phone ranks the same pool — because a Discover that
 * ranks differently on two clients is the kind of difference nobody can
 * point at, and the one that most looks like a bug in the other client.
 *
 * The caps are the reason this is worth sharing rather than retyping:
 * author affinity is capped at 30 and tag affinity at 15 so that they
 * enrich the ranking rather than dominate it, and a client that forgot a
 * cap would quietly turn Discover into "more of whoever you clicked last".
 */
export function discoverScore(
  x: {
    created_at: string;
    user_id: string;
    hashtags?: string[] | null;
    hype_count?: number | null;
    comment_count?: number | null;
    save_count?: number | null;
    share_count?: number | null;
  },
  ctx: {
    now: number;
    /** The reader's own interests and profile tags, lower-cased, no `#`. */
    interests: Set<string>;
    /** get_affinity's author weights. */
    authorAffinity: Record<string, number>;
    /** get_affinity's tag weights. */
    tagAffinity: Record<string, number>;
    /** Tags the reader follows. */
    followedTags: Set<string>;
  },
): number {
  const tags = postTags(x);
  const interestBoost =
    ctx.interests.size > 0 && tags.some((t) => ctx.interests.has(t)) ? INTEREST_BOOST : 0;
  const authorBoost = Math.min(
    Math.max(ctx.authorAffinity[x.user_id] ?? 0, 0) * AFFINITY_WEIGHT,
    AUTHOR_CAP,
  );
  const tagBoost = Math.min(
    tagAffinityFor(x, ctx.tagAffinity, ctx.followedTags) * AFFINITY_WEIGHT,
    TAG_CAP,
  );
  return baseScore(x, ctx.now) + interestBoost + authorBoost + tagBoost;
}

/** A post whose tags overlap the reader's interests. */
export const INTEREST_BOOST = 12;
/** Raw affinity weights are multiplied by this before being capped. */
export const AFFINITY_WEIGHT = 1.5;
/** As much as author affinity may ever add. */
export const AUTHOR_CAP = 30;
/** As much as tag affinity may ever add. */
export const TAG_CAP = 15;
