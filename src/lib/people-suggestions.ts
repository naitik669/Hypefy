import type { SupabaseClient } from "@supabase/supabase-js";
import { getBlockedIds } from "@/lib/blocked";
import {
  countSharedHypes,
  rankPeople,
  type MutualFace,
  type PeopleCandidate,
  type PeopleSuggestion,
} from "@hypefy/core/people-rank";

/**
 * Everything rankPeople needs, read with the viewer's own session.
 *
 * follows, hypes and profiles are all readable by anyone under RLS, so this
 * needs no new function in the database: it reads the same rows the
 * profile and post screens already read, and the ranking happens in
 * @hypefy/core where a test can drive it.
 *
 * The caps are for a network that is much bigger than today's 24 accounts.
 * Each one degrades to "fewer signals", never to "wrong person": the
 * eligibility rules (not me, not followed, not requested, not blocked, not
 * suspended) are applied to every candidate whatever was cut.
 */
const CAP = {
  candidates: 200,
  followsOfFollowing: 5000,
  myHypes: 200,
  coHypes: 5000,
} as const;

/** Faces for the mutuals row and the profile fields every tile needs. */
const PROFILE_COLS =
  "id, display_name, username, avatar_hue, avatar_url, accent_id, is_verified, created_at, last_seen_at, profile_completed, suspended_at, suspended_until";

export async function loadPeopleSuggestions(
  supabase: SupabaseClient,
  me: string,
  now = Date.now()
): Promise<PeopleSuggestion[]> {
  const [followingRes, followersRes, requestedRes, myHypesRes, candidatesRes, blocked] = await Promise.all([
    supabase.from("follows").select("following_id").eq("follower_id", me),
    supabase.from("follows").select("follower_id").eq("following_id", me),
    supabase.from("follow_requests").select("target_id").eq("requester_id", me),
    supabase
      .from("hypes")
      .select("target_type, target_id")
      .eq("user_id", me)
      .order("created_at", { ascending: false })
      .limit(CAP.myHypes),
    supabase
      .from("profiles")
      .select(PROFILE_COLS)
      .eq("profile_completed", true)
      .neq("id", me)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(CAP.candidates),
    getBlockedIds(supabase),
  ]);

  // The candidates are the page. Without them there is nothing to show, and
  // an empty grid would claim there is nobody here — so say it failed.
  if (candidatesRes.error) throw candidatesRes.error;

  const following = new Set(((followingRes.data ?? []) as { following_id: string }[]).map((r) => r.following_id));
  const followers = new Set(((followersRes.data ?? []) as { follower_id: string }[]).map((r) => r.follower_id));
  const requested = new Set(((requestedRes.data ?? []) as { target_id: string }[]).map((r) => r.target_id));
  const myHypes = (myHypesRes.data ?? []) as { target_type: string; target_id: string }[];
  const candidates = (candidatesRes.data ?? []) as PeopleCandidate[];

  const followingIds = [...following];
  const candidateIds = candidates.map((c) => c.id);
  const hypeTargets = [...new Set(myHypes.map((h) => h.target_id))];

  const [fofRes, coHypesRes, facesRes, countsRes] = await Promise.all([
    followingIds.length
      ? supabase
          .from("follows")
          .select("follower_id, following_id")
          .in("follower_id", followingIds)
          .limit(CAP.followsOfFollowing)
      : Promise.resolve({ data: [] as { follower_id: string; following_id: string }[] }),
    hypeTargets.length
      ? supabase
          .from("hypes")
          .select("user_id, target_type, target_id")
          .in("target_id", hypeTargets)
          .neq("user_id", me)
          .limit(CAP.coHypes)
      : Promise.resolve({ data: [] as { user_id: string; target_type: string; target_id: string }[] }),
    followingIds.length
      ? supabase.from("profiles").select("id, display_name, username, avatar_hue, avatar_url").in("id", followingIds)
      : Promise.resolve({ data: [] }),
    candidateIds.length
      ? supabase.from("follows").select("following_id").in("following_id", candidateIds)
      : Promise.resolve({ data: [] as { following_id: string }[] }),
  ]);

  const followerCounts = new Map<string, number>();
  for (const r of (countsRes.data ?? []) as { following_id: string }[]) {
    followerCounts.set(r.following_id, (followerCounts.get(r.following_id) ?? 0) + 1);
  }

  const faces = new Map<string, MutualFace>();
  for (const p of (facesRes.data ?? []) as {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_hue: number | null;
    avatar_url: string | null;
  }[]) {
    faces.set(p.id, {
      id: p.id,
      name: p.display_name?.trim() || p.username || "Someone",
      avatar_hue: p.avatar_hue,
      avatar_url: p.avatar_url,
    });
  }

  return rankPeople(candidates, {
    me,
    following,
    requested,
    followers,
    blocked,
    followsOfFollowing: (fofRes.data ?? []) as { follower_id: string; following_id: string }[],
    sharedHypes: countSharedHypes(
      me,
      myHypes,
      (coHypesRes.data ?? []) as { user_id: string; target_type: string; target_id: string }[]
    ),
    followerCounts,
    faces,
    now,
  });
}
