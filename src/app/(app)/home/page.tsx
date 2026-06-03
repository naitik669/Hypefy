import { redirect } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { ShowsRow } from "@/components/home/ShowsRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedCard } from "@/components/feed/FeedCard";

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

  // Who the user follows (for future ranking boost)
  const { data: followRows } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", user.id);

  const followingIds = new Set(
    (followRows ?? []).map((r: any) => r.following_id as string),
  );

  // Global feed — show ALL posts so early users always see content.
  // Followed users + own posts appear first (client-side re-sort below).
  const { data: rawPosts } = await supabase
    .from("posts")
    .select("*, profiles(id, display_name, username, avatar_hue, profile_tags)")
    .order("created_at", { ascending: false })
    .limit(50);

  // Soft-boost: own posts + followed user posts float to the top
  const all = normalise(rawPosts);
  const boosted = all.filter(
    (p: any) => p.user_id === user.id || followingIds.has(p.user_id),
  );
  const rest = all.filter(
    (p: any) => p.user_id !== user.id && !followingIds.has(p.user_id),
  );
  const posts = [...boosted, ...rest].slice(0, 30);

  // Fetch which posts current user has hyped/saved — for initial state
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

  // Current user profile for "Your Show" bubble
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("display_name, username, avatar_hue")
    .eq("id", user.id)
    .maybeSingle();

  // Check if the current user already has an active (unexpired) Show (story)
  const { data: myActiveShow } = await supabase
    .from("shows")
    .select("id")
    .eq("user_id", user.id)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  const currentUserForRow = myProfile
    ? {
        name: myProfile.display_name ?? myProfile.username ?? "You",
        hue: myProfile.avatar_hue ?? 280,
        hasActiveShow: !!myActiveShow,
      }
    : undefined;

  // Active Shows (stories) from OTHERS for the Shows row
  const { data: activeShows } = await supabase
    .from("shows")
    .select("id, user_id, media_url, profiles(display_name, avatar_hue, username)")
    .gt("expires_at", new Date().toISOString())
    .neq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const shows = (activeShows ?? []).map((s: any) => {
    const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    return { id: s.id, name: p?.display_name ?? p?.username ?? "User", hue: p?.avatar_hue ?? 280, seen: false };
  });

  return (
    <>
      <TopBar />
      <ShowsRow shows={shows} currentUser={currentUserForRow} />

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
