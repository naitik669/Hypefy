import Link from "next/link";
import { redirect } from "next/navigation";
import { Compass } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedCard } from "@/components/feed/FeedCard";
import { UserSuggestionCard } from "@/components/discover/UserSuggestionCard";

function normalise(raw: unknown[] | null) {
  return (raw ?? []).map((p: any) => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
  }));
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-4 pb-2 pt-5 text-base font-bold tracking-tight">{children}</h2>
  );
}

export default async function DiscoverPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Who the user already follows (to exclude from people suggestions)
  const { data: followRows } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", user.id);

  const followingIds = (followRows ?? []).map((r: any) => r.following_id as string);

  // ── A. Blowing up — last 7 days, weighted engagement + recency ──
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: recentRaw } = await supabase
    .from("posts")
    .select("*, profiles(id, display_name, username, avatar_hue, profile_tags)")
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(100);
  const recent = normalise(recentRaw);

  const now = Date.now();
  const scored = recent
    .filter((p: any) => p.user_id !== user.id)
    .map((p: any) => {
      const hoursOld = (now - new Date(p.created_at).getTime()) / 3_600_000;
      const recencyBoost = Math.max(0, 48 - hoursOld) / 8; // fresh posts get up to +6
      const score = (p.hype_count ?? 0) * 3 + (p.comment_count ?? 0) * 2 + recencyBoost;
      return { ...p, _score: score };
    })
    .sort((a: any, b: any) => b._score - a._score);
  const trending = scored.slice(0, 10);

  // ── Fresh posts — newest from everyone (de-duped from trending) ──
  const trendingIds = new Set(trending.map((p: any) => p.id));
  const fresh = recent.filter((p: any) => !trendingIds.has(p.id)).slice(0, 10);

  // ── Trending tags — most-used hashtags across recent posts ──
  const tagCounts = new Map<string, number>();
  for (const p of recent) {
    for (const raw of (p.hashtags ?? []) as string[]) {
      const tag = raw.replace(/^#/, "").toLowerCase();
      if (tag) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const trendingTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag, count]) => ({ tag, count }));

  // ── B. People to follow (not self, not already following) ──
  let peopleQuery = supabase
    .from("profiles")
    .select("id, display_name, username, avatar_hue, bio, profile_tags")
    .eq("profile_completed", true)
    .neq("id", user.id)
    .limit(10);

  // Only apply the exclusion filter when there are following IDs to exclude
  if (followingIds.length > 0) {
    peopleQuery = peopleQuery.not(
      "id",
      "in",
      `(${followingIds.join(",")})`,
    ) as typeof peopleQuery;
  }

  const { data: people } = await peopleQuery;

  const hasTrending = trending.length > 0;
  const hasFresh = fresh.length > 0;
  const hasTags = trendingTags.length > 0;
  const hasPeople = (people ?? []).length > 0;
  const isEmpty = !hasTrending && !hasFresh && !hasPeople;

  return (
    <>
      <PageHeader title="Discover" />

      <div className="px-4 py-3">
        <SearchBar placeholder="Search people, posts" href="/search" />
      </div>

      {isEmpty ? (
        <EmptyState
          icon={Compass}
          title="Nothing here yet"
          text="Hypefy gets better as more people join. Check back soon."
        />
      ) : (
        <>
          {/* Trending tags */}
          {hasTags && (
            <>
              <SectionTitle>Trending tags</SectionTitle>
              <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1">
                {trendingTags.map(({ tag, count }) => (
                  <Link
                    key={tag}
                    href={`/search?q=%23${encodeURIComponent(tag)}`}
                    className="flex shrink-0 flex-col rounded-2xl border border-border bg-surface px-4 py-2.5"
                  >
                    <span className="text-sm font-bold text-accent">#{tag}</span>
                    <span className="text-xs text-muted">{count} {count === 1 ? "post" : "posts"}</span>
                  </Link>
                ))}
              </div>
            </>
          )}

          {/* Blowing up — weighted ranking */}
          {hasTrending && (
            <>
              <SectionTitle>Blowing up 🔥</SectionTitle>
              <div className="flex flex-col">
                {trending.map((post) => (
                  <FeedCard key={post.id} post={post} currentUserId={user.id} />
                ))}
              </div>
            </>
          )}

          {/* Fresh posts — newest from everyone */}
          {hasFresh && (
            <>
              <SectionTitle>Fresh posts</SectionTitle>
              <div className="flex flex-col">
                {fresh.map((post: any) => (
                  <FeedCard key={post.id} post={post} currentUserId={user.id} />
                ))}
              </div>
            </>
          )}

          {/* People to follow */}
          {hasPeople && (
            <>
              <SectionTitle>People to Hype</SectionTitle>
              <div className="flex flex-col pb-4">
                {(people ?? []).map((person: any) => (
                  <UserSuggestionCard
                    key={person.id}
                    user={{
                      id: person.id,
                      name: person.display_name ?? person.username ?? "User",
                      handle: person.username ? `@${person.username}` : "",
                      hue: person.avatar_hue ?? 280,
                      verified: false,
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
