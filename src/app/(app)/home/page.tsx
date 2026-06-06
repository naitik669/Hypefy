import { redirect } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { ShowsRow } from "@/components/home/ShowsRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedCard } from "@/components/feed/FeedCard";
import { UploadProgressBar } from "@/components/upload/UploadProvider";

function normalise(raw: unknown[] | null) {
  return (raw ?? []).map((p: any) => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
  }));
}

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const nowIso = new Date().toISOString();

  // Fire all independent queries concurrently (was 5 sequential round-trips).
  const [
    { data: followRows },
    { data: rawPosts },
    { data: myProfile },
    { data: myShows },
    { data: activeShows },
  ] = await Promise.all([
    // Who the user follows (for ranking boost)
    supabase.from("follows").select("following_id").eq("follower_id", user.id),
    // Global feed â€” show ALL posts so early users always see content.
    supabase
      .from("posts")
      .select("*, profiles(id, display_name, username, avatar_hue, avatar_url, profile_tags)")
      .order("created_at", { ascending: false })
      .limit(50),
    // Current user profile for "Your Show" bubble
    supabase.from("profiles").select("display_name, username, avatar_hue, avatar_url").eq("id", user.id).maybeSingle(),
    // Current user's own active Shows â€” oldest first
    supabase.from("shows").select("id").eq("user_id", user.id).gt("expires_at", nowIso).order("created_at", { ascending: true }),
    // Active Shows from OTHERS â€” newest first
    supabase
      .from("shows")
      .select("id, user_id, profiles(display_name, avatar_hue, avatar_url, username)")
      .gt("expires_at", nowIso)
      .neq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const followingIds = new Set(
    (followRows ?? []).map((r: any) => r.following_id as string),
  );

  // Soft-boost: own posts + followed user posts float to the top
  const all = normalise(rawPosts);
  const boosted = all.filter(
    (p: any) => p.user_id === user.id || followingIds.has(p.user_id),
  );
  const rest = all.filter(
    (p: any) => p.user_id !== user.id && !followingIds.has(p.user_id),
  );
  const posts = [...boosted, ...rest].slice(0, 30);

  // Fetch which posts current user has hyped/saved â€” for initial state
  const postIds = posts.map((p: any) => p.id);
  const [hypesRes, savedRes] = await Promise.all(
    postIds.length > 0
      ? [
          supabase
            .from("hypes")
            .select("target_id")
            .eq("user_id", user.id)
            .eq("target_type", "post")
            .in("target_id", postIds),
          supabase
            .from("saved_posts")
            .select("post_id")
            .eq("user_id", user.id)
            .in("post_id", postIds),
        ]
      : [{ data: [] }, { data: [] }],
  );

  const hypedIds = new Set((hypesRes.data ?? []).map((h: any) => h.target_id));
  const savedIds = new Set((savedRes.data ?? []).map((s: any) => s.post_id));

  const currentUserForRow = myProfile
    ? {
        name: myProfile.display_name ?? myProfile.username ?? "You",
        hue: myProfile.avatar_hue ?? 280,
        hasActiveShow: (myShows?.length ?? 0) > 0,
        showId: myShows?.[0]?.id as string | undefined, // entry = oldest
      }
    : undefined;

  // Group by user: keep most-recent-activity order, but enter at their OLDEST show.
  const byUser = new Map<string, { id: string; name: string; hue: number }>();
  for (const s of (activeShows ?? []) as any[]) {
    const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    const existing = byUser.get(s.user_id);
    if (!existing) {
      byUser.set(s.user_id, {
        id: s.id,
        name: p?.display_name ?? p?.username ?? "User",
        hue: p?.avatar_hue ?? 280,
      });
    } else {
      existing.id = s.id; // iterating newestâ†’oldest, so this ends as the oldest
    }
  }
  const shows = [...byUser.values()].map((v) => ({ ...v, seen: false }));

  return (
    <>
      <TopBar />
      <ShowsRow shows={shows} currentUser={currentUserForRow} />
      <UploadProgressBar />

      {posts.length === 0 ? (
        <EmptyState
          icon={PlusCircle}
          title="No posts yet"
          text="Follow people or create the first post."
          ctaLabel="Create Post"
          ctaHref="/create/post"
        />
      ) : (
        <div className="flex flex-col">
          {posts.map((post: any) => (
            <FeedCard
              key={post.id}
              post={{ ...post, initialHyped: hypedIds.has(post.id), initialSaved: savedIds.has(post.id) }}
              currentUserId={user.id}
            />
          ))}
        </div>
      )}
    </>
  );
}
