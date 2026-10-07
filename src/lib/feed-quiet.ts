import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The quiet controls: mute a person, hide one post or Shot.
 *
 * Lighter than a block and private to whoever uses them. A muted person's
 * posts, Shots and Shows leave your feeds; you still follow each other, they
 * can still message you, and nothing tells them. "Not interested" takes one
 * post or Shot out of your feeds. See 0125 for the rules the database holds.
 */

type Db = Pick<SupabaseClient, "rpc" | "from">;

export type FeedExclusions = {
  /** People whose posts, Shots and Shows are left out. */
  muted: Set<string>;
  /** Single posts and Shots that are left out. */
  posts: Set<string>;
  shots: Set<string>;
};

export const NO_EXCLUSIONS: FeedExclusions = { muted: new Set(), posts: new Set(), shots: new Set() };

const ids = (v: unknown) => new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function toFeedExclusions(data: unknown): FeedExclusions {
  const row = (Array.isArray(data) ? data[0] : data) as
    | { muted?: unknown; posts?: unknown; shots?: unknown }
    | null
    | undefined;
  if (!row) return NO_EXCLUSIONS;
  return { muted: ids(row.muted), posts: ids(row.posts), shots: ids(row.shots) };
}

/**
 * What to leave out of this person's feeds. A failure leaves nothing out:
 * the feed still loads, with something in it the person had hidden, which
 * is the smaller of the two ways this can go wrong.
 */
export async function getFeedExclusions(supabase: Db): Promise<FeedExclusions> {
  const { data, error } = await supabase.rpc("feed_exclusions");
  return error ? NO_EXCLUSIONS : toFeedExclusions(data);
}

/** Should this item be left out? */
export function isQuieted(
  x: { id: string; user_id: string },
  kind: "post" | "shot",
  ex: FeedExclusions,
): boolean {
  return ex.muted.has(x.user_id) || (kind === "post" ? ex.posts : ex.shots).has(x.id);
}

export async function hideContent(supabase: Db, kind: "post" | "shot", id: string): Promise<boolean> {
  const { error } = await supabase.rpc("hide_content", { p_kind: kind, p_content_id: id });
  return !error;
}

export async function muteUser(supabase: Db, userId: string): Promise<boolean> {
  const { error } = await supabase.rpc("mute_user", { p_target: userId });
  return !error;
}

export async function unmuteUser(supabase: Db, me: string, userId: string): Promise<boolean> {
  const { error } = await supabase.from("muted_users").delete().eq("muter_id", me).eq("muted_id", userId);
  return !error;
}

export async function isMutedByMe(supabase: Db, me: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("muted_users")
    .select("muted_id")
    .eq("muter_id", me)
    .eq("muted_id", userId)
    .maybeSingle();
  return !!data;
}

export async function removeFollower(supabase: Db, followerId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("remove_follower", { p_follower: followerId });
  return !error && data === true;
}

/** The words each control answers with. One place, so every menu says the same. */
export const QUIET_COPY = {
  hidden: "Hidden. You won't see this again.",
  hideFailed: "Couldn't hide that. Try again.",
  muted: (who: string) => `Muted ${who}. They won't be told.`,
  unmuted: (who: string) => `Unmuted ${who}`,
  muteFailed: "Couldn't mute. Try again.",
  removed: (who: string) => `Removed ${who}. They won't be told.`,
  removeFailed: "Couldn't remove. Try again.",
} as const;
