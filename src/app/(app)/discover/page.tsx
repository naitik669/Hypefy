import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { DiscoverView } from "@/components/discover/DiscoverView";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { tagAffinityFor } from "@/lib/feed-rank";
import { getBlockedIds } from "@/lib/blocked";

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
function score(
  x: any,
  now: number,
  interests: Set<string>,
  authorAff: Record<string, number>,
  tagAff: Record<string, number>,
  followedTags: Set<string>,
) {
  const tags = ((x.hashtags ?? []) as string[]).map((t) => t.replace(/^#/, "").toLowerCase());
  const interestBoost = interests.size > 0 && tags.some((t) => interests.has(t)) ? 12 : 0;
  const authorBoost = Math.min(Math.max(authorAff[x.user_id] ?? 0, 0) * 1.5, 30);
  const tagBoost = Math.min(tagAffinityFor(x, tagAff, followedTags) * 1.5, 15);
  return (
    (x.hype_count ?? 0) * 3 +
    (x.comment_count ?? 0) * 2 +
    (x.save_count ?? 0) * 2 +
    (x.share_count ?? 0) * 2 +
    recencyBoost(x.created_at, now) +
    interestBoost +
    authorBoost +
    tagBoost
  );
}

export default async function DiscoverPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const now = Date.now();

  const weekAgo = new Date(now - 7 * 24 * 3_600_000).toISOString();

  const [postsRes, shotsRes, meRes, affRes, followedTagRes, trendingRes, suggestedRes, newPeopleRes] = await Promise.all([
    supabase
      .from("posts")
      .select("id, caption, body, image_url, image_urls, hashtags, hype_count, comment_count, save_count, share_count, created_at, user_id, profiles!posts_user_id_fkey(id, display_name, username, avatar_hue, avatar_url)")
      .neq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("shots")
      .select("id, media_url, poster_url, caption, hype_count, comment_count, save_count, share_count, created_at, user_id, profiles!posts_user_id_fkey(id, display_name, username, avatar_hue, avatar_url)")
      .neq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase.from("profiles").select("interests, profile_tags").eq("id", user.id).maybeSingle(),
    supabase.rpc("get_affinity", { p_lookback_days: 60 }),
    supabase.from("hashtag_follows").select("tag").eq("user_id", user.id),
    supabase.rpc("get_trending_tags", { p_limit: 16 }),
    supabase.rpc("get_suggested_people", { p_limit: 12 }),
    // New this week — freshly joined, completed profiles
    supabase
      .from("profiles")
      .select("id, display_name, username, avatar_hue, avatar_url, is_verified, created_at")
      .eq("profile_completed", true)
      .neq("id", user.id)
      .gt("created_at", weekAgo)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const interests = new Set<string>([
    ...(((meRes.data as any)?.interests ?? []) as string[]),
    ...(((meRes.data as any)?.profile_tags ?? []) as string[]),
  ].map((t) => t.replace(/^#/, "").toLowerCase()));
  const authorAff = ((affRes.data as any)?.authors ?? {}) as Record<string, number>;
  const tagAff = ((affRes.data as any)?.tags ?? {}) as Record<string, number>;
  const followedTags = new Set<string>((followedTagRes.data ?? []).map((r: any) => r.tag));
  const blockedIds = await getBlockedIds(supabase);

  const posts = (postsRes.data ?? []).map(one).filter((p: any) => !blockedIds.has(p.user_id)).map((p: any) => ({ ...p, _score: score(p, now, interests, authorAff, tagAff, followedTags) }));
  const shots = (shotsRes.data ?? []).map(one).filter((s: any) => !blockedIds.has(s.user_id)).map((s: any) => ({ ...s, _score: score(s, now, interests, authorAff, tagAff, followedTags) }));

  const trendingPosts = [...posts].sort((a, b) => b._score - a._score).slice(0, 12);
  const trendingIds = new Set(trendingPosts.map((p) => p.id));
  const freshPosts = posts.filter((p) => !trendingIds.has(p.id)).slice(0, 12);
  const trendingShots = [...shots].sort((a, b) => b._score - a._score).slice(0, 12);

  // Velocity-based trending tags (rising, not raw count)
  const tags = ((trendingRes.data ?? []) as any[]).map((t) => ({ tag: t.tag, count: t.recent ?? 0 }));

  // Friendly-circle people suggestions (ranked: friends-of-friends, shared interests, reciprocity)
  const people = ((suggestedRes.data ?? []) as any[]).filter((p) => !blockedIds.has(p.id));
  const newPeople = ((newPeopleRes.data ?? []) as any[]).filter((p) => !blockedIds.has(p.id));

  // ── Curated buckets, carved from the post pool (no extra queries) ──
  const tagsOf = (p: any) =>
    ((p.hashtags ?? []) as string[]).map((t) => t.replace(/^#/, "").toLowerCase());

  // "Based on your interests": posts matching the user's own tags
  const interestPosts =
    interests.size > 0
      ? posts
          .filter((p: any) => tagsOf(p).some((t) => interests.has(t)))
          .sort((a: any, b: any) => b._score - a._score)
          .slice(0, 6)
      : [];

  // Interest-category rails — synonym buckets over the same pool
  const CATEGORY_DEFS: { label: string; tags: string[] }[] = [
    { label: "Technology", tags: ["tech", "technology", "coding", "code", "dev", "ai", "programming", "startup", "startups", "software"] },
    { label: "Gaming", tags: ["gaming", "game", "games", "minecraft", "bedrock", "valorant", "gta", "fortnite", "esports"] },
    { label: "Art & Design", tags: ["art", "design", "drawing", "sketch", "artist", "illustration", "animation"] },
    { label: "Photography", tags: ["photo", "photography", "randompic", "picoftheday", "camera", "portrait"] },
    { label: "Music", tags: ["music", "song", "rap", "singer", "playlist", "concert"] },
    { label: "Memes", tags: ["meme", "memes", "funny", "lol", "shitpost"] },
  ];
  const categoryRails = CATEGORY_DEFS.map(({ label, tags: catTags }) => {
    const set = new Set(catTags);
    const items = posts
      .filter((p: any) => tagsOf(p).some((t) => set.has(t)))
      .sort((a: any, b: any) => b._score - a._score)
      .slice(0, 8);
    return { label, posts: items };
  }).filter((c) => c.posts.length >= 2);

  return (
    <>
      <PageHeader title="Discover" />
      <PullToRefresh>
        <div className="px-4 py-3">
          <SearchBar placeholder="Search people, posts, #tags" href="/search" />
        </div>
        <DiscoverView
          currentUserId={user.id}
          trendingPosts={trendingPosts}
          freshPosts={freshPosts}
          trendingShots={trendingShots}
          people={(people ?? []) as any[]}
          newPeople={newPeople}
          interestPosts={interestPosts}
          categoryRails={categoryRails}
          tags={tags}
        />
      </PullToRefresh>
    </>
  );
}
