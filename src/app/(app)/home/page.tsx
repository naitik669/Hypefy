import { redirect } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { ShowsRow } from "@/components/home/ShowsRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedCard } from "@/components/feed/FeedCard";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Fetch real posts — joined with author profile
  const { data: rawPosts } = await supabase
    .from("posts")
    .select("*, profiles(id, display_name, username, avatar_hue, profile_tags)")
    .order("created_at", { ascending: false })
    .limit(30);

  const posts = (rawPosts ?? []).map((p) => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
  }));

  // Active shots for the Shows row
  const { data: activeShots } = await supabase
    .from("shots")
    .select("id, user_id, media_url, profiles(display_name, avatar_hue, username)")
    .gt("expires_at", new Date().toISOString())
    .neq("user_id", user.id)  // exclude own shots from friends row
    .order("created_at", { ascending: false })
    .limit(20);

  const shows = (activeShots ?? []).map((s) => {
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
