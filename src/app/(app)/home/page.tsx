import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { ShowsRow } from "@/components/home/ShowsRow";
import { FeedList } from "@/components/feed/FeedList";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { UploadProgressBar } from "@/components/upload/UploadProvider";
import {
  feedScore,
  diversify,
  postTags,
  tagAffinityFor,
  refreshJitter,
  refreshSeed,
} from "@/lib/feed-rank";
import { getBlockedIds } from "@/lib/blocked";
import { jsonRecord } from "@/lib/supabase/typed";

function normalise(raw: unknown[] | null) {
  return (raw ?? []).map((p: any) => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
  }));
}

const POST_COLS = "*, profiles!posts_user_id_fkey(id, display_name, username, avatar_hue, avatar_url, profile_tags, is_verified)";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const nowIso = new Date().toISOString();

  // Follow graph first: the followed-posts query depends on it.
  const [{ data: followRows }, blockedIds] = await Promise.all([
    supabase.from("follows").select("following_id").eq("follower_id", user.id),
    getBlockedIds(supabase),
  ]);
  const followingIds = new Set(
    (followRows ?? []).map((r: any) => r.following_id as string),
  );
  const feedUserIds = [...followingIds, user.id];

  // Fire all remaining queries concurrently.
  const [
    { data: followedPosts },
    { data: rawPosts },
    { data: myProfile },
    { data: myShows },
    { data: activeShows },
    { data: followedReposts },
    { data: affinityData },
    { data: followedTagRows },
  ] = await Promise.all([
    // Posts from people I follow (+ my own): guaranteed present even when
    // the global firehose has scrolled past them.
    supabase
      .from("posts")
      .select("*, profiles!posts_user_id_fkey(id, display_name, username, avatar_hue, avatar_url, profile_tags, is_verified)")
      .in("user_id", feedUserIds)
      .order("created_at", { ascending: false })
      .limit(40),
    // Global feed â€” wider candidate window so ranking has room to work as
    // the post volume grows (was 50).
    supabase
      .from("posts")
      .select("*, profiles!posts_user_id_fkey(id, display_name, username, avatar_hue, avatar_url, profile_tags, is_verified)")
      .order("created_at", { ascending: false })
      .limit(150),
    // Current user profile for "Your Show" bubble + interest signals
    supabase.from("profiles").select("display_name, username, avatar_hue, avatar_url, interests, profile_tags").eq("id", user.id).maybeSingle(),
    // Current user's own active Shows â€” oldest first
    supabase.from("shows").select("id").eq("user_id", user.id).gt("expires_at", nowIso).order("created_at", { ascending: true }).limit(50),
    // Active Shows from OTHERS â€” newest first
    supabase
      .from("shows")
      .select("id, user_id, profiles!shows_user_id_fkey(display_name, avatar_hue, avatar_url, username)")
      .gt("expires_at", nowIso)
      .neq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    // Recent reposts by people I follow: their reposted posts join the feed
    followingIds.size > 0
      ? supabase
          .from("reposts")
          .select("post_id, created_at, user_id, profiles:user_id(display_name, username), posts(*, profiles!posts_user_id_fkey(id, display_name, username, avatar_hue, avatar_url, profile_tags, is_verified))")
          .in("user_id", [...followingIds])
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as any[] }),
    // Interaction affinity (authors + tags I engage with) for personalization
    supabase.rpc("get_affinity", { p_lookback_days: 60 }),
    // Hashtags I follow
    supabase.from("hashtag_follows").select("tag").eq("user_id", user.id).limit(200),
  ]);

  // People lists behind the Favourite / Hypers feed tabs — fetched lightly
  // here (just ids) since FeedList only needs them to scope its own query
  // when that tab is first opened.
  const [{ data: favoriteRows }, { data: hyperRows }, { data: reverseHyperRows }] = await Promise.all([
    supabase.from("favorites").select("friend_id").eq("user_id", user.id).limit(500),
    supabase.from("close_friends").select("friend_id").eq("user_id", user.id).limit(500),
    // People who added ME as a Hyper — the reverse direction, so FeedCard can
    // resolve the mutual-Hyper badge from props instead of a per-card query.
    // Unlike the others this grows with popularity, not with your own actions,
    // so the cap matters: a widely-added account would otherwise pull thousands
    // of rows on every home render.
    supabase.from("close_friends").select("user_id").eq("friend_id", user.id).limit(1000),
  ]);
  const favoriteIds = (favoriteRows ?? []).map((r: any) => r.friend_id as string);
  const hyperIds = (hyperRows ?? []).map((r: any) => r.friend_id as string);
  const reverseHyperIds = (reverseHyperRows ?? []).map((r: any) => r.user_id as string);
  // Mutual = I added them AND they added me.
  const reverseSet = new Set(reverseHyperIds);
  const mutualHyperIds = hyperIds.filter((id) => reverseSet.has(id));

  // Which active shows I've already viewed (server-side truth for the seen ring)
  const activeShowIds = (activeShows ?? []).map((s: any) => s.id);
  const { data: myViews } = activeShowIds.length > 0
    ? await supabase
        .from("show_views")
        .select("show_id")
        .eq("viewer_id", user.id)
        .in("show_id", activeShowIds)
    : { data: [] as any[] };
  const viewedShowIds = new Set((myViews ?? []).map((v: any) => v.show_id as string));

  // Merge followed + global, dedupe (followed posts can appear in both slices).
  // Blocked authors never make it into the pool.
  const byId = new Map<string, any>();
  for (const p of [...normalise(followedPosts), ...normalise(rawPosts)]) {
    if (blockedIds.has(p.user_id)) continue;
    if (!byId.has(p.id)) byId.set(p.id, p);
  }

  // Blend in reposted posts: use the REPOST time for recency so they resurface,
  // and tag with who reposted for the FeedCard header.
  for (const r of (followedReposts ?? []) as any[]) {
    const post = Array.isArray(r.posts) ? r.posts[0] : r.posts;
    if (!post) continue;
    if (blockedIds.has(post.user_id) || blockedIds.has(r.user_id)) continue;
    const reposterProfile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    const reposter = reposterProfile?.display_name ?? reposterProfile?.username ?? null;
    const normalised = {
      ...post,
      profiles: Array.isArray(post.profiles) ? post.profiles[0] ?? null : post.profiles,
      created_at: r.created_at, // rank by repost time
      _repostedBy: reposter,
    };
    // Repost wins over the plain copy so the header shows
    byId.set(post.id, byId.has(post.id) ? { ...byId.get(post.id), created_at: r.created_at, _repostedBy: reposter } : normalised);
  }

  // My interest signals (hashtags I care about) for personalized ranking.
  const myInterests = new Set<string>([
    ...(((myProfile as any)?.interests ?? []) as string[]),
    ...(((myProfile as any)?.profile_tags ?? []) as string[]),
  ].map((t) => t.replace(/^#/, "").toLowerCase()));

  // Interaction affinity: authors + tags I actually engage with, plus tags I follow.
  const authorAff = jsonRecord((affinityData as any)?.authors);
  const tagAff = jsonRecord((affinityData as any)?.tags);
  const followedTags = new Set<string>((followedTagRows ?? []).map((r: any) => r.tag));

  // What the viewer has already interacted with, across the whole candidate
  // pool rather than the final page. This used to run *after* ranking and
  // only for the top 30, purely to set the icon state — so the ranker had no
  // idea which posts the viewer had already seen and kept showing them first.
  const candidateIds = [...byId.keys()];
  const [hypesRes, savedRes, commentedRes] = await Promise.all(
    candidateIds.length > 0
      ? [
          supabase
            .from("hypes")
            .select("target_id")
            .eq("user_id", user.id)
            .eq("target_type", "post")
            .in("target_id", candidateIds),
          supabase
            .from("saved_posts")
            .select("post_id")
            .eq("user_id", user.id)
            .in("post_id", candidateIds),
          supabase
            .from("comments")
            .select("post_id")
            .eq("user_id", user.id)
            .in("post_id", candidateIds),
        ]
      : [{ data: [] }, { data: [] }, { data: [] }],
  );

  const hypedIds = new Set((hypesRes.data ?? []).map((h: any) => h.target_id));
  const savedIds = new Set((savedRes.data ?? []).map((s: any) => s.post_id));
  const commentedIds = new Set(
    (commentedRes.data ?? []).map((c: any) => c.post_id).filter(Boolean),
  );

  // Rank by blended score; recency breaks ties. Then diversify authors.
  const now = Date.now();
  // Changes every few minutes, so a pull-to-refresh reshuffles posts that
  // scored close together instead of replaying a byte-identical list.
  const seed = refreshSeed(now);
  const ranked = [...byId.values()]
    .map((p: any) => ({
      ...p,
      _score:
        feedScore(
          p,
          p.user_id === user.id,
          followingIds.has(p.user_id),
          myInterests.size > 0 && postTags(p).some((t) => myInterests.has(t)),
          now,
          authorAff[p.user_id] ?? 0,
          tagAffinityFor(p, tagAff, followedTags),
          hypedIds.has(p.id) || savedIds.has(p.id) || commentedIds.has(p.id),
        ) + refreshJitter(p.id, seed),
    }))
    .sort((a: any, b: any) =>
      b._score !== a._score
        ? b._score - a._score
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 30);
  const posts = diversify(ranked);

  const currentUserForRow = myProfile
    ? {
        name: myProfile.display_name ?? myProfile.username ?? "You",
        hue: myProfile.avatar_hue ?? 280,
        avatarUrl: (myProfile as any).avatar_url ?? null,
        hasActiveShow: (myShows?.length ?? 0) > 0,
        showId: myShows?.[0]?.id as string | undefined, // entry = oldest
      }
    : undefined;

  // Group by user: keep most-recent-activity order, but enter at their OLDEST show.
  const byUser = new Map<string, { id: string; name: string; hue: number; avatar_url: string | null; allIds: string[] }>();
  for (const s of (activeShows ?? []) as any[]) {
    if (blockedIds.has(s.user_id)) continue;
    const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    const existing = byUser.get(s.user_id);
    if (!existing) {
      byUser.set(s.user_id, {
        id: s.id,
        name: p?.display_name ?? p?.username ?? "User",
        hue: p?.avatar_hue ?? 280,
        avatar_url: p?.avatar_url ?? null,
        allIds: [s.id],
      });
    } else {
      existing.id = s.id; // iterating newest->oldest, so this ends as the oldest
      existing.allIds.push(s.id);
    }
  }
  // Seen only when EVERY active show from that user has a server-side view
  const shows = [...byUser.values()].map(({ allIds, ...v }) => ({
    ...v,
    seen: allIds.every((id) => viewedShowIds.has(id)),
  }));

  return (
    <>
      <TopBar />
      <PullToRefresh>
        <ShowsRow shows={shows} currentUser={currentUserForRow} />
        <UploadProgressBar />

        {/* Always the feed — FeedList renders the warm-up prompt at the END
            when there's nothing (more) to scroll, so it never opens on a
            dead "no users here" screen. */}
        <FeedList
          initialPosts={posts.map((post: any) => ({
            ...post,
            initialHyped: hypedIds.has(post.id),
            initialSaved: savedIds.has(post.id),
          }))}
          currentUserId={user.id}
          followingIds={[...followingIds]}
          favoriteIds={favoriteIds}
          hyperIds={hyperIds}
          mutualHyperIds={mutualHyperIds}
          blockedIds={[...blockedIds]}
        />
      </PullToRefresh>
    </>
  );
}
