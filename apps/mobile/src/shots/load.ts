import { getBlockedIds } from "@hypefy/core/blocked";
import { getFeedExclusions, isQuieted } from "@hypefy/core/feed-quiet";
import { shotFeedScore, diversify } from "@hypefy/core/feed-rank";
import { rows } from "../query";

/**
 * The Shots reel, ranked the way the website ranks it.
 *
 * `shotFeedScore` from @hypefy/core/feed-rank is the ranking, and it is
 * `feedScore` underneath — so a Shot and a post are weighed on one scale
 * and the two clients agree about both.
 *
 * **`removed_at is null` is not an optimisation.** The select policy
 * allows `removed_at is null OR user_id = auth.uid() OR is_admin()`,
 * which is right for an author's own archive and wrong for a feed: a Shot
 * taken down by a moderator was still served into its author's reel, and
 * every removed Shot on Hypefy into an admin's. The web's page says so in
 * its own comment, and leaving the filter out here would reintroduce it
 * on the phone only.
 *
 * **What the web has and this does not, yet:**
 *
 *  - **Ghost Share**, which places one Shot chosen for you.
 *  - **The seen penalty.** `shot_views` is what the web reads, and the
 *    phone has no view-recording yet — so nothing is marked seen and
 *    nothing is demoted. Recording views is a write and its own work.
 *  - **Affinity**, for the same reason Discover's feed has none here.
 *  - **Music** (`track`), saving, rehyping, the comment sheet.
 */

/** The web's window. */
export const SHOT_LIMIT = 80;

/**
 * What a reel needs.
 *
 * `duration_secs`, `trim_start` and `trim_end` are asked for because the
 * player needs to know where a Shot begins and ends — a Shot trimmed on
 * the web plays its untrimmed original otherwise, including whatever was
 * cut off the end.
 */
export const SHOT_COLUMNS =
  "id, user_id, media_url, poster_url, caption, created_at, hype_count, comment_count, " +
  "save_count, duration_secs, trim_start, trim_end, " +
  "profiles(id, display_name, username, avatar_hue, avatar_url, is_verified)";

export type ShotProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
  is_verified: boolean | null;
};

export type Shot = {
  id: string;
  user_id: string;
  media_url: string;
  poster_url: string | null;
  caption: string | null;
  created_at: string;
  hype_count: number | null;
  comment_count: number | null;
  save_count: number | null;
  duration_secs: number | null;
  trim_start: number | null;
  trim_end: number | null;
  profiles: ShotProfile | null;
};

type Builder = PromiseLike<{ data: unknown; error: unknown }> & {
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

function one<T>(raw: unknown): T | null {
  if (Array.isArray(raw)) return (raw[0] as T) ?? null;
  return (raw as T) ?? null;
}

export function normaliseShot(raw: Record<string, unknown>): Shot {
  return { ...(raw as unknown as Shot), profiles: one<ShotProfile>(raw.profiles) };
}

/**
 * Where a Shot starts and stops, in seconds.
 *
 * A Shot is trimmed by storing two offsets rather than by cutting the
 * file, so a player that ignores them shows footage the author removed —
 * which on a Shot is often the part they did not want seen.
 *
 * Exported separately so a test can run it: a null trim means the whole
 * clip, a zero start is a real value and not an absent one, and an end
 * past the duration is clamped rather than trusted.
 */
export function trimOf(shot: {
  duration_secs: number | null;
  trim_start: number | null;
  trim_end: number | null;
}): { start: number; end: number | null } {
  const duration = shot.duration_secs ?? null;
  // `?? 0` and not `|| 0`: a stored 0 is a real start, and `||` would
  // treat it the same as absent — which happens to give the same answer
  // here and would not if the default ever changed.
  const start = Math.max(0, shot.trim_start ?? 0);
  const rawEnd = shot.trim_end ?? null;
  if (rawEnd === null) return { start, end: duration };
  const end = duration === null ? rawEnd : Math.min(rawEnd, duration);
  // An end at or before the start is not a trim, it is bad data; play the
  // whole thing rather than nothing.
  return end > start ? { start, end } : { start: 0, end: duration };
}

/** Ranked and spread by author. Exported so a test can run it. */
export function rankShots(
  shots: Shot[],
  ctx: {
    currentUserId: string;
    following: Set<string>;
    blocked: Set<string>;
    hidden: Set<string>;
    now?: number;
  },
): Shot[] {
  const now = ctx.now ?? Date.now();
  const kept = shots.filter(
    (s) =>
      !isQuieted(s, "shot", {
        muted: ctx.blocked,
        posts: new Set(),
        shots: ctx.hidden,
      }),
  );
  const scored = kept.map((s) => ({
    s,
    score: shotFeedScore(
      s,
      s.user_id === ctx.currentUserId,
      ctx.following.has(s.user_id),
      now,
    ),
  }));
  scored.sort((a, b) => b.score - a.score || (a.s.created_at < b.s.created_at ? 1 : -1));
  /*
   * Spread by author, for the same reason the feed and Discover do it:
   * four Shots from one person yesterday would otherwise be the first
   * four a viewer swipes through, which is not a reel.
   */
  return diversify(scored.map((x) => x.s));
}

export async function loadShots(supabase: Queryable, userId: string): Promise<Shot[]> {
  const [shotsRes, followsRes, blocked, quiet] = await Promise.all([
    supabase
      .from("shots")
      .select(SHOT_COLUMNS)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(SHOT_LIMIT),
    supabase.from("follows").select("following_id").eq("follower_id", userId),
    getBlockedIds(supabase as never),
    getFeedExclusions(supabase as never),
  ]);

  for (const id of quiet.muted) blocked.add(id);

  return rankShots(
    rows<Record<string, unknown>>(shotsRes, "shots").map(normaliseShot),
    {
      currentUserId: userId,
      following: new Set(
        rows<{ following_id: string }>(followsRes, "follows").map((r) => r.following_id),
      ),
      blocked,
      hidden: quiet.shots,
    },
  );
}
