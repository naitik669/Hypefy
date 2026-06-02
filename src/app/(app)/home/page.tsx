import { redirect } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { ShowsRow } from "@/components/home/ShowsRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedCard } from "@/components/feed/FeedCard";

/** Flatten Supabase join (profiles comes back as array). */
function normalise(rawPosts: unknown[] | null) {
  return (rawPosts ?? []).map((p: any) => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
  }));
}

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // ── 1. Who does this user follow? ─────────────────────────
  const { data: followRows } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", user.id);

  const followingIds = (followRows ?? []).map((r: any) => r.following_id as string);
  const feedUserIds = [...followingIds, user.id]; // own posts always included

  // ── 2. Personalised feed (following + self) ────────────────
  const { data: rawPosts } = await supabase
    .from("posts")
    .select("*, profiles(id, display_name, username, avatar_hue, profile_tags)")
    .in("user_id", feedUserIds)
    .order("created_at", { ascending: false })
    .limit(30);

  // ── 3. Global fallback for new users with empty feed ───────
  let posts = normalise(rawPosts);
  if (posts.length === 0) {
    const { data: globalPosts } = await supabase
      .from("posts")
      .select("*, profiles(id, display_name, username, avatar_hue, profile_tags)")
      .order("created_at", { ascending: false })
      .limit(30);
    posts = normalise(globalPosts);
  }

  // ── Active shots for the Shows row (others only) ───────────
  const { data: activeShots } = await supabase
    .from("shots")
    .select("id, user_id, media_url, profiles(display_name, avatar_hue, username)")
    .gt("expires_at", new Date().toISOString())
    .neq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const shows = (activeShots ?? []).map((s: any) => {
    const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    return {
      id: s.id,
      name: profile?.display_name ?? profile?.username ?? "User",
      hue: profile?.avatar_hue ?? 280,
      seen: false,
    };
  });

  return (
    <>
      <TopBar />
      <ShowsRow shows={shows} />

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
          {posts.map((post) => (
            <FeedCard key={post.id} post={post} currentUserId={user.id} />
          ))}
        </div>
      )}
    </>
  );
}
