import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { DiscoverView } from "@/components/discover/DiscoverView";

function one(p: any) {
  return { ...p, profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles };
}

/** Tiered recency boost (newer content surfaces higher). */
function recencyBoost(createdAt: string, now: number) {
  const h = (now - new Date(createdAt).getTime()) / 3_600_000;
  if (h < 2) return 20;
  if (h < 24) return 10;
  if (h < 72) return 5;
  return 0;
}
function score(x: any, now: number) {
  return (
    (x.hype_count ?? 0) * 3 +
    (x.comment_count ?? 0) * 2 +
    (x.save_count ?? 0) * 2 +
    (x.share_count ?? 0) * 2 +
    recencyBoost(x.created_at, now)
  );
}

export default async function DiscoverPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const now = Date.now();

  const [postsRes, shotsRes, followRes] = await Promise.all([
    supabase
      .from("posts")
      .select("id, caption, body, image_url, image_urls, hashtags, hype_count, comment_count, save_count, share_count, created_at, user_id, profiles(id, display_name, username, avatar_hue, avatar_url)")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("shots")
      .select("id, media_url, poster_url, caption, hype_count, comment_count, save_count, share_count, created_at, user_id, profiles(id, display_name, username, avatar_hue, avatar_url)")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.from("follows").select("following_id").eq("follower_id", user.id),
  ]);

  const followingIds = (followRes.data ?? []).map((r: any) => r.following_id as string);

  const posts = (postsRes.data ?? []).map(one).map((p: any) => ({ ...p, _score: score(p, now) }));
  const shots = (shotsRes.data ?? []).map(one).map((s: any) => ({ ...s, _score: score(s, now) }));

  const trendingPosts = [...posts].sort((a, b) => b._score - a._score).slice(0, 12);
  const trendingIds = new Set(trendingPosts.map((p) => p.id));
  const freshPosts = posts.filter((p) => !trendingIds.has(p.id)).slice(0, 12);
  const trendingShots = [...shots].sort((a, b) => b._score - a._score).slice(0, 12);

  // Tags across recent posts
  const tagCounts = new Map<string, number>();
  for (const p of posts) {
    for (const raw of (p.hashtags ?? []) as string[]) {
      const tag = raw.replace(/^#/, "").toLowerCase();
      if (tag) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([tag, count]) => ({ tag, count }));

  // Creators to follow
  let peopleQuery = supabase
    .from("profiles")
    .select("id, display_name, username, avatar_hue, avatar_url, bio, profile_tags")
    .eq("profile_completed", true)
    .neq("id", user.id)
    .limit(12);
  if (followingIds.length > 0) {
    peopleQuery = peopleQuery.not("id", "in", `(${followingIds.join(",")})`) as typeof peopleQuery;
  }
  const { data: people } = await peopleQuery;

  return (
    <>
      <PageHeader title="Discover" />
      <div className="px-4 py-3">
        <SearchBar placeholder="Search people, posts, #tags" href="/search" />
      </div>
      <DiscoverView
        currentUserId={user.id}
        trendingPosts={trendingPosts}
        freshPosts={freshPosts}
        trendingShots={trendingShots}
        people={(people ?? []) as any[]}
        tags={tags}
      />
    </>
  );
}
