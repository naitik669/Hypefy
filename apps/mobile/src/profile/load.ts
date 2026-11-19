import { hueFromId } from "@hypefy/core/profile";
import { isLocked, type FollowState } from "@hypefy/core/follow";
import { row, count } from "../query";

/**
 * A profile, its counts, and where the viewer stands with it.
 *
 * The web's page is a server component doing eight queries; this does the
 * same arithmetic as the user, through RLS.
 *
 * **What is shared rather than reimplemented**: `hueFromId` for the
 * fallback avatar colour, and `isLocked` for whether a private account's
 * content is hidden. The second one matters — a pending REQUEST does not
 * unlock anything, which is the whole point of a request, and a client
 * that treats "I tapped follow" as access shows an empty grid and makes
 * the viewer think the person has no posts.
 *
 * **What the web's page has and this does not, yet**, listed because a
 * profile that quietly shows less is hard to point at:
 *
 *  - **Showcases, streak badges, the 24h status note, the profile card**,
 *    and the Hyper (close-friend) relationship.
 *  - **Shots and Collections tabs.** The grid is posts only, and the
 *    "Posts" count still includes Shots because the web's does — so the
 *    number can exceed the grid. Said on screen rather than silently.
 *  - **Message, and the Hyper button.** Both are their own surfaces.
 *  - **The cosmetics**: name fonts, name glow, avatar decorations,
 *    nameplates, custom banner images and profile colours. The banner is
 *    its gradient; the name is plain.
 */

/**
 * The columns this screen reads.
 *
 * Deliberately NOT `PUBLIC_PROFILE_COLUMNS` from core, which is forty
 * columns including every cosmetic. The database refuses `select("*")` on
 * profiles, so the list has to be explicit either way, and on a phone
 * every column crosses a mobile connection. A column added to the web's
 * list does not need adding here until this screen renders it.
 */
export const PROFILE_COLUMNS =
  "id, username, display_name, bio, avatar_url, avatar_hue, banner_id, " +
  "profile_tags, is_private, is_verified, pronouns, created_at, profile_completed";

export type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_hue: number | null;
  banner_id: string | null;
  profile_tags: string[] | null;
  is_private: boolean | null;
  is_verified: boolean | null;
  pronouns: string | null;
  created_at: string | null;
};

export type ProfileStats = {
  /** Posts AND Shots, as the web counts them. */
  posts: number;
  followers: number;
  following: number;
};

export type ProfileView = {
  profile: ProfileRow;
  stats: ProfileStats;
  state: FollowState;
  isOwn: boolean;
  locked: boolean;
  /** The hue to draw a fallback avatar with. */
  hue: number;
};

type Counted = { count: number | null; error: unknown };
type Maybe = { data: unknown; error: unknown };

type Builder<T> = PromiseLike<T> & {
  select(columns: string, options?: { count: "exact"; head: true }): Builder<T>;
  eq(column: string, value: string | boolean): Builder<T>;
  maybeSingle(): PromiseLike<Maybe>;
};

type Queryable = {
  from(table: string): Builder<Counted & Maybe>;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

/** Supabase returns an embedded row as an object or a one-element array. */
function one<T>(raw: unknown): T | null {
  if (Array.isArray(raw)) return (raw[0] as T) ?? null;
  return (raw as T) ?? null;
}

/**
 * How many posts, followers and following.
 *
 * `head: true` with `count: "exact"` asks the database to count without
 * sending any rows — four counts for the price of four empty responses.
 *
 * **"Posts" includes Shots**, which is the web's own choice and is
 * commented as such there. Copying the arithmetic matters more than
 * agreeing with it: a profile that says 12 on the site and 9 on the phone
 * is a bug report nobody can diagnose.
 */
export async function loadStats(
  supabase: Queryable,
  userId: string,
): Promise<ProfileStats> {
  const [posts, shots, followers, following] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("shots").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("following_id", userId),
    supabase
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("follower_id", userId),
  ]);
  return {
    posts: count(posts, "post count") + count(shots, "shot count"),
    followers: count(followers, "follower count"),
    following: count(following, "following count"),
  };
}

/**
 * Where the viewer stands: following, requested, or neither.
 *
 * Two queries rather than one, because they answer different questions —
 * a follow row and a pending request are separate tables, and a request
 * is not a follow. Checking only `follows` makes a pending request look
 * like "not following", so the button offers to send it again.
 */
export async function loadFollowState(
  supabase: Queryable,
  viewerId: string,
  targetId: string,
): Promise<FollowState> {
  const [follow, request] = await Promise.all([
    supabase
      .from("follows")
      .select("id")
      .eq("follower_id", viewerId)
      .eq("following_id", targetId)
      .maybeSingle(),
    supabase
      .from("follow_requests")
      .select("target_id")
      .eq("requester_id", viewerId)
      .eq("target_id", targetId)
      .maybeSingle(),
  ]);
  if (row(follow, "follow row")) return "following";
  if (row(request, "follow request")) return "requested";
  return "none";
}

/**
 * The whole screen's data, or null when there is no such profile.
 *
 * `profile_completed` is part of the lookup, as it is on the web: an
 * account that signed up and never finished setup has a row and no
 * profile, and showing it as an empty person is worse than a not-found.
 */
export async function loadProfile(
  supabase: Queryable,
  username: string,
  viewerId: string | null,
): Promise<ProfileView | null> {
  const found = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    // Lower-cased, as the web does: usernames are stored lower-case and a
    // link shared with different capitalisation must still resolve.
    .eq("username", username.toLowerCase())
    .eq("profile_completed", true)
    .maybeSingle();

  const profile = one<ProfileRow>(row(found, "profile"));
  if (!profile) return null;

  const isOwn = viewerId === profile.id;
  const state =
    viewerId && !isOwn ? await loadFollowState(supabase, viewerId, profile.id) : "none";
  const stats = await loadStats(supabase, profile.id);

  return {
    profile,
    stats,
    state,
    isOwn,
    locked: isLocked({ isPrivate: Boolean(profile.is_private), isOwn, state }),
    hue: profile.avatar_hue ?? hueFromId(profile.id),
  };
}

/**
 * Follows or unfollows, and returns the state to show.
 *
 * `follow_user` and `unfollow_user` are SECURITY DEFINER RPCs that own the
 * follow row and its notification, and that turn a follow of a private
 * account into a request. An insert into `follows` would skip all three.
 */
export async function setFollow(
  supabase: Queryable,
  rpc: "follow_user" | "unfollow_user",
  targetId: string,
): Promise<{ raw: unknown } | { error: string }> {
  const { data, error } = await supabase.rpc(rpc, { p_target: targetId });
  if (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Could not update that.";
    return { error: message };
  }
  return { raw: data };
}
