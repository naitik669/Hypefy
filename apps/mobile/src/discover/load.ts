import { getBlockedIds } from "@hypefy/core/blocked";
import { discoverScore } from "@hypefy/core/discover-rank";
import { diversify } from "@hypefy/core/feed-rank";
import { jsonRecord } from "@hypefy/core/supabase/typed";
import { rows, row } from "../query";

/**
 * Discover's pool, ranked the way the website ranks it.
 *
 * `discoverScore` from @hypefy/core/discover-rank is the whole ranking,
 * caps included — and the caps are the point: author affinity stops at 30
 * and tag affinity at 15, so they enrich the order rather than dominate
 * it. A client that forgot a cap would quietly turn Discover into "more of
 * whoever you clicked last", and nobody could point at it.
 *
 * `diversify` is applied for the reason the web states: without it, one
 * person who posted four things yesterday owns the top four slots, which
 * is not discovery.
 *
 * **What the web's page has and this does not, yet**, listed in full:
 *
 *  - **Shots in the pool.** The web ranks posts and Shots together and
 *    mixes them with `mixShots`. A Shot tile needs the video player, so
 *    they are left out entirely rather than rendered as a tile that
 *    cannot play — which is also why `mixShots` is not called here.
 *  - **The category rails** carved out of the same pool.
 *  - **The endless feed** that reads on past the pool from a cursor.
 *  - **Following a tag** from a chip (a write).
 */

/** The web's windows. Posts only, because Shots are not rendered yet. */
export const POST_LIMIT = 150;
/** How many new accounts the "new this week" row shows. */
export const NEW_PEOPLE = 8;
/** How many trending tags and suggested people the web asks for. */
export const TAG_LIMIT = 16;
export const PEOPLE_LIMIT = 12;

export const DISCOVER_POST_COLUMNS =
  "id, caption, image_url, image_urls, hashtags, hype_count, comment_count, save_count, " +
  "share_count, created_at, user_id, " +
  "profiles!posts_user_id_fkey(id, display_name, username, avatar_hue, avatar_url, is_verified)";

export type DiscoverProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
  is_verified: boolean | null;
};

export type DiscoverPost = {
  id: string;
  caption: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  hashtags: string[] | null;
  hype_count: number | null;
  comment_count: number | null;
  save_count: number | null;
  share_count: number | null;
  created_at: string;
  user_id: string;
  profiles: DiscoverProfile | null;
};

export type TrendingTag = { tag: string; count: number };

export type DiscoverData = {
  posts: DiscoverPost[];
  tags: TrendingTag[];
  people: DiscoverProfile[];
  newPeople: DiscoverProfile[];
};

type Rows = { data: unknown[] | null; error: unknown };
type Row = { data: unknown; error: unknown };

type Builder = PromiseLike<Rows & Row> & {
  select(columns: string): Builder;
  eq(column: string, value: string | boolean): Builder;
  neq(column: string, value: string): Builder;
  gt(column: string, value: string): Builder;
  is(column: string, value: null): Builder;
  order(column: string, options: { ascending: boolean }): Builder;
  limit(count: number): Builder;
  maybeSingle(): PromiseLike<Row>;
};

type Queryable = {
  from(table: string): Builder;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<Row>;
};

function one<T>(raw: unknown): T | null {
  if (Array.isArray(raw)) return (raw[0] as T) ?? null;
  return (raw as T) ?? null;
}

export function normaliseDiscoverPost(raw: Record<string, unknown>): DiscoverPost {
  return {
    ...(raw as unknown as DiscoverPost),
    profiles: one<DiscoverProfile>(raw.profiles),
  };
}

/**
 * The reader's own interests, as the score wants them.
 *
 * Interests and profile tags together, lower-cased with the `#` stripped —
 * the same normalisation the web does, and the reason it matters is that
 * hashtags are stored with neither convention guaranteed, so "#Art" and
 * "art" must match.
 */
export function interestsOf(row: unknown): Set<string> {
  const r = (row ?? {}) as { interests?: unknown; profile_tags?: unknown };
  const all = [
    ...((Array.isArray(r.interests) ? r.interests : []) as string[]),
    ...((Array.isArray(r.profile_tags) ? r.profile_tags : []) as string[]),
  ];
  return new Set(all.map((t) => String(t).replace(/^#/, "").toLowerCase()));
}

/** Ranked, then spread by author. Exported so a test can run it. */
export function rankDiscover(
  posts: DiscoverPost[],
  ctx: {
    now: number;
    interests: Set<string>;
    authorAffinity: Record<string, number>;
    tagAffinity: Record<string, number>;
    followedTags: Set<string>;
    blocked: Set<string>;
  },
): DiscoverPost[] {
  const scored = posts
    .filter((p) => !ctx.blocked.has(p.user_id))
    .map((p) => ({ p, score: discoverScore(p, ctx) }));
  scored.sort((a, b) => b.score - a.score);
  return diversify(scored.map((s) => s.p));
}

export async function loadDiscover(
  supabase: Queryable,
  userId: string,
): Promise<DiscoverData> {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 24 * 3_600_000).toISOString();

  const [postsRes, meRes, affRes, followedTagRes, trendingRes, peopleRes, newPeopleRes, blocked] =
    await Promise.all([
      supabase
        .from("posts")
        .select(DISCOVER_POST_COLUMNS)
        // Your own posts are not discovery.
        .neq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(POST_LIMIT),
      supabase.from("profiles").select("interests, profile_tags").eq("id", userId).maybeSingle(),
      supabase.rpc("get_affinity", { p_lookback_days: 60 }),
      supabase.from("hashtag_follows").select("tag").eq("user_id", userId),
      supabase.rpc("get_trending_tags", { p_limit: TAG_LIMIT }),
      supabase.rpc("get_suggested_people", { p_limit: PEOPLE_LIMIT }),
      supabase
        .from("profiles")
        .select("id, display_name, username, avatar_hue, avatar_url, is_verified, created_at")
        .eq("profile_completed", true)
        .neq("id", userId)
        .gt("created_at", weekAgo)
        .order("created_at", { ascending: false })
        .limit(NEW_PEOPLE),
      getBlockedIds(supabase as never),
    ]);

  const affinity = (row<{ authors?: unknown; tags?: unknown }>(affRes, "affinity") ??
    {}) as { authors?: unknown; tags?: unknown };
  const posts = rows<Record<string, unknown>>(postsRes, "discover posts").map(
    normaliseDiscoverPost,
  );

  return {
    posts: rankDiscover(posts, {
      now,
      interests: interestsOf(row(meRes, "my interests")),
      authorAffinity: jsonRecord(affinity.authors as never),
      tagAffinity: jsonRecord(affinity.tags as never),
      followedTags: new Set(
        rows<{ tag: string }>(followedTagRes, "followed tags").map((r) => r.tag),
      ),
      blocked,
    }),
    /*
     * `recent` is the velocity the RPC reports — rising, not raw count —
     * which is why a tag with four posts today can outrank one with forty
     * from last month.
     */
    tags: rows<{ tag: string; recent?: number }>(trendingRes, "trending tags").map((t) => ({
      tag: t.tag,
      count: t.recent ?? 0,
    })),
    people: rows<DiscoverProfile>(peopleRes, "suggested people").filter(
      (p) => !blocked.has(p.id),
    ),
    newPeople: rows<DiscoverProfile>(newPeopleRes, "new people").filter(
      (p) => !blocked.has(p.id),
    ),
  };
}
