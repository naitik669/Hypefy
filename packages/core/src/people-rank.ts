/**
 * Who to suggest on the People page, in what order, and why.
 *
 * Platform-free on purpose: the loader hands it plain rows and it hands back
 * the ranked list, so the ranking is something a test can drive rather than
 * something only a query can show.
 *
 * What it can honestly do at Hypefy's size (24 accounts on 26 Nov 2026) is
 * put everyone in a sensible order, and say why each one is there. It reads
 * four signals:
 *
 *   - mutuals: people you follow who follow them
 *   - they follow you
 *   - posts and Shots you have both hyped
 *   - whether they have been around this week
 *
 * Hypes are the one the old get_suggested_people (migration 0004) left out,
 * and they are the richest signal there is: 283 hypes against 78 follows
 * when this was written. It only admitted friends-of-friends, followers and
 * shared tags, so for most people it returned three or four names and a lot
 * of nothing.
 *
 * Nobody is dropped for having no signal. With this few people, "nobody to
 * suggest" would be a lie; they go to the back, with the plainest true
 * reason we have.
 */

import { accentById } from "./profile-accent";

export type PeopleCandidate = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
  accent_id: string | null;
  is_verified: boolean | null;
  created_at: string | null;
  last_seen_at: string | null;
  profile_completed: boolean | null;
  suspended_at: string | null;
  suspended_until: string | null;
};

export type MutualFace = {
  id: string;
  name: string;
  avatar_hue: number | null;
  avatar_url: string | null;
};

export type PeopleSignals = {
  me: string;
  /** Everyone I follow. */
  following: ReadonlySet<string>;
  /** Everyone I have asked to follow and who has not answered. */
  requested: ReadonlySet<string>;
  /** Everyone who follows me. */
  followers: ReadonlySet<string>;
  /** Blocked in either direction. */
  blocked: ReadonlySet<string>;
  /**
   * Accounts kept off the People page by the app, not by the viewer: test
   * accounts and accounts under review. Optional so a caller that has none
   * passes nothing.
   */
  excluded?: ReadonlySet<string>;
  /** Rows of `follows` whose follower is someone I follow. */
  followsOfFollowing: readonly { follower_id: string; following_id: string }[];
  /** How many of the things I hyped each person also hyped. */
  sharedHypes: ReadonlyMap<string, number>;
  /** Follower count per candidate. Missing means none. */
  followerCounts: ReadonlyMap<string, number>;
  /** Faces for the people I follow, for the mutuals row. */
  faces: ReadonlyMap<string, MutualFace>;
  now: number;
};

export type PeopleSuggestion = {
  id: string;
  name: string;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
  verified: boolean;
  /** Their own accent colour, for the painted edge along the tile's foot. */
  accent: string;
  /** The one line under the name. Always true of this person. */
  reason: string;
  /** Up to three of the people I follow who follow them. */
  mutuals: MutualFace[];
  score: number;
};

export const WEIGHTS = {
  mutual: 3,
  followsYou: 4,
  /** Per doubling of shared hypes, so one heavy hyper cannot outrank everyone. */
  sharedHypes: 2,
  activeThisWeek: 1,
} as const;

const DAY = 86_400_000;

/** A suspension still running at `now`. One with no end runs forever. */
export function isSuspended(c: PeopleCandidate, now: number): boolean {
  if (!c.suspended_at) return false;
  if (!c.suspended_until) return true;
  return Date.parse(c.suspended_until) > now;
}

/** Whether this person may be suggested at all. */
export function isSuggestable(c: PeopleCandidate, s: PeopleSignals): boolean {
  return (
    c.id !== s.me &&
    !!c.profile_completed &&
    !s.following.has(c.id) &&
    !s.requested.has(c.id) &&
    !s.blocked.has(c.id) &&
    !s.excluded?.has(c.id) &&
    !isSuspended(c, s.now)
  );
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The line under the name, strongest true reason first.
 *
 * Mutuals lead because they come with faces, which is the reason a person
 * can check at a glance. Followers count is last and only for people we
 * have nothing better to say about.
 */
export function reasonFor(args: {
  mutuals: number;
  followsYou: boolean;
  sharedHypes: number;
  followers: number;
  joinedDaysAgo: number | null;
}): string {
  if (args.mutuals > 0) return plural(args.mutuals, "mutual", "mutuals");
  if (args.followsYou) return "Follows you";
  if (args.sharedHypes > 0) return "Hypes what you hype";
  if (args.joinedDaysAgo !== null && args.joinedDaysAgo <= 14) return "New to Hypefy";
  if (args.followers > 0) return plural(args.followers, "follower", "followers");
  return "Say hi first";
}

export function rankPeople(
  candidates: readonly PeopleCandidate[],
  s: PeopleSignals
): PeopleSuggestion[] {
  // Who among the people I follow follows each candidate.
  const mutualIds = new Map<string, string[]>();
  for (const row of s.followsOfFollowing) {
    if (!s.following.has(row.follower_id)) continue;
    const list = mutualIds.get(row.following_id) ?? [];
    if (!list.includes(row.follower_id)) list.push(row.follower_id);
    mutualIds.set(row.following_id, list);
  }

  const seen = new Set<string>();
  const out: (PeopleSuggestion & { followers: number })[] = [];
  for (const c of candidates) {
    if (seen.has(c.id) || !isSuggestable(c, s)) continue;
    seen.add(c.id);

    const mids = mutualIds.get(c.id) ?? [];
    const followsYou = s.followers.has(c.id);
    const shared = s.sharedHypes.get(c.id) ?? 0;
    const followers = s.followerCounts.get(c.id) ?? 0;
    const seenAt = c.last_seen_at ? Date.parse(c.last_seen_at) : NaN;
    const active = Number.isFinite(seenAt) && s.now - seenAt <= 7 * DAY;
    const joined = c.created_at ? Date.parse(c.created_at) : NaN;
    const joinedDaysAgo = Number.isFinite(joined) ? Math.floor((s.now - joined) / DAY) : null;

    const score =
      mids.length * WEIGHTS.mutual +
      (followsYou ? WEIGHTS.followsYou : 0) +
      Math.log2(1 + shared) * WEIGHTS.sharedHypes +
      (active ? WEIGHTS.activeThisWeek : 0);

    out.push({
      id: c.id,
      name: c.display_name?.trim() || c.username || "Someone",
      username: c.username,
      avatar_hue: c.avatar_hue,
      avatar_url: c.avatar_url,
      verified: !!c.is_verified,
      accent: accentById(c.accent_id).color,
      reason: reasonFor({ mutuals: mids.length, followsYou, sharedHypes: shared, followers, joinedDaysAgo }),
      mutuals: mids
        .map((id) => s.faces.get(id))
        .filter((f): f is MutualFace => !!f)
        .slice(0, 3),
      score,
      followers,
    });
  }

  // Score, then the better-followed, then id, so the same inputs always give
  // the same order on the server and in a test.
  out.sort((a, b) => b.score - a.score || b.followers - a.followers || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out.map(({ followers: _f, ...rest }) => rest);
}

/** Pages of `size` for the swipeable grid. The last page may be short. */
export function pagesOf<T>(items: readonly T[], size = 4): T[][] {
  if (size < 1) throw new Error("page size must be at least 1");
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

/** Count how many of `mine` each other person also hyped. */
export function countSharedHypes(
  me: string,
  mine: readonly { target_type: string; target_id: string }[],
  theirs: readonly { user_id: string; target_type: string; target_id: string }[]
): Map<string, number> {
  const key = (t: { target_type: string; target_id: string }) => `${t.target_type}:${t.target_id}`;
  const mineSet = new Set(mine.map(key));
  const perUser = new Map<string, Set<string>>();
  for (const h of theirs) {
    if (h.user_id === me) continue;
    const k = key(h);
    if (!mineSet.has(k)) continue;
    const set = perUser.get(h.user_id) ?? new Set<string>();
    set.add(k);
    perUser.set(h.user_id, set);
  }
  return new Map([...perUser].map(([u, set]) => [u, set.size]));
}
