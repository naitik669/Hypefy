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

  // ── A. Trending posts (last 7 days, ranked by hype_count) ──
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: trendingRaw } = await supabase
    .from("posts")
    .select("*, profiles(id, display_name, username, avatar_hue, profile_tags)")
    .neq("user_id", user.id)
    .gte("created_at", sevenDaysAgo)
    .order("hype_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);
  const trending = normalise(trendingRaw);

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
  const hasPeople = (people ?? []).length > 0;
  const isEmpty = !hasTrending && !hasPeople;

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
          {/* Trending posts */}
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
