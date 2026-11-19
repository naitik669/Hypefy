import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { DiscoverView } from "@/components/discover/DiscoverView";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { diversify } from "@/lib/feed-rank";
import { getBlockedIds } from "@/lib/blocked";
import { discoverScore } from "@/lib/discover-rank";
import { one as unwrap, jsonRecord } from "@/lib/supabase/typed";

/** Flatten a row's embedded `profiles` join from `T | T[]` down to `T | null`. */
function one(p: any) {
  return { ...p, profiles: unwrap(p.profiles) };
}


/*
 * The score moved to @hypefy/core/discover-rank as `discoverScore`,
 * because the Expo client ranks the same pool — and a Discover that ranks
 * differently on two clients is the difference nobody can point at, and
 * the one that most looks like a bug in the other client.
 *
 * This stays as a thin wrapper so the call sites below are unchanged.
 * baseScore decays engagement by age; it used to add the raw counts, so a
 * Shot from June with eight hypes scored 44 against 5 for one posted
 * yesterday and every new Shot sat at the bottom of Discover. See
 * discover-rank.ts for the measurement.
 */
function score(
  x: any,
  now: number,
  interests: Set<string>,
  authorAff: Record<string, number>,
  tagAff: Record<string, number>,
  followedTags: Set<string>
) {
  return discoverScore(x, {
    now,
    interests,
    authorAffinity: authorAff,
    tagAffinity: tagAff,
    followedTags,
  });
}

export default async function DiscoverPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const now = Date.now();

  const weekAgo = new Date(now - 7 * 24 * 3_600_000).toISOString();

  const [
    postsRes,
    shotsRes,
    meRes,
    affRes,
    followedTagRes,
    trendingRes,
    suggestedRes,
    newPeopleRes,
  ] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, caption, body, image_url, image_urls, aspect_ratio, hashtags, hype_count, comment_count, save_count, share_count, created_at, user_id, profiles!posts_user_id_fkey(id, display_name, username, avatar_hue, avatar_url)"
      )
      .neq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("shots")
      .select(
        "id, media_url, poster_url, caption, hype_count, comment_count, save_count, share_count, created_at, user_id, profiles!shots_user_id_fkey(id, display_name, username, avatar_hue, avatar_url)"
      )
      .neq("user_id", user.id)
      // As on the reel: never a removed Shot, whoever is looking.
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("profiles")
      .select("interests, profile_tags")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.rpc("get_affinity", { p_lookback_days: 60 }),
    supabase.from("hashtag_follows").select("tag").eq("user_id", user.id),
    supabase.rpc("get_trending_tags", { p_limit: 16 }),
    supabase.rpc("get_suggested_people", { p_limit: 12 }),
    // New this week — freshly joined, completed profiles
    supabase
      .from("profiles")
      .select(
        "id, display_name, username, avatar_hue, avatar_url, is_verified, created_at"
      )
      .eq("profile_completed", true)
      .neq("id", user.id)
      .gt("created_at", weekAgo)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const interests = new Set<string>(
    [
      ...(((meRes.data as any)?.interests ?? []) as string[]),
      ...(((meRes.data as any)?.profile_tags ?? []) as string[]),
    ].map((t) => t.replace(/^#/, "").toLowerCase())
  );
  const authorAff = jsonRecord((affRes.data as any)?.authors);
  const tagAff = jsonRecord((affRes.data as any)?.tags);
  const followedTags = new Set<string>(
    (followedTagRes.data ?? []).map((r: any) => r.tag)
  );
  const blockedIds = await getBlockedIds(supabase);

  const posts = (postsRes.data ?? [])
    .map(one)
    .filter((p: any) => !blockedIds.has(p.user_id))
    .map((p: any) => ({
      ...p,
      _score: score(p, now, interests, authorAff, tagAff, followedTags),
    }));
  const shots = (shotsRes.data ?? [])
    .map(one)
    .filter((s: any) => !blockedIds.has(s.user_id))
    .map((s: any) => ({
      ...s,
      _score: score(s, now, interests, authorAff, tagAff, followedTags),
    }));

  // The whole pool, best first — this is the For You feed. It used to be cut
  // into a top-12 "Blowing up" and a next-12 "Fresh", which left the other
  // 126 posts the server had already fetched unused behind a Show more
  // button. Now all of it is the feed, revealed as you scroll, and the feed
  // reads on into older posts from where the pool ends.
  const rankedPosts = [...posts].sort((a, b) => b._score - a._score);
  const trendingPosts = rankedPosts.slice(0, 12);
  // Oldest in the pool BEFORE the blocked filter, so the endless feed resumes
  // exactly where this query stopped rather than re-reading its tail.
  const pool = postsRes.data ?? [];
  const feedCursor = pool.length
    ? (pool[pool.length - 1] as { created_at: string }).created_at
    : null;
  // All of them, ranked, for scattering through the For You feed; the top 12
  // are still what the Shots chip shows.
  // Ranked, then spread by author. Without diversify one person who posted
  // four Shots yesterday owns the top four slots of Discover — which is what
  // happens the moment recency carries real weight, and is not discovery.
  // The helper is lossless: it reorders and never drops.
  const feedShots = diversify([...shots].sort((a, b) => b._score - a._score));
  const trendingShots = feedShots.slice(0, 12);

  // Velocity-based trending tags (rising, not raw count)
  const tags = ((trendingRes.data ?? []) as any[]).map((t) => ({
    tag: t.tag,
    count: t.recent ?? 0,
  }));

  // Friendly-circle people suggestions (ranked: friends-of-friends, shared interests, reciprocity)
  const people = ((suggestedRes.data ?? []) as any[]).filter(
    (p) => !blockedIds.has(p.id)
  );
  const newPeople = ((newPeopleRes.data ?? []) as any[]).filter(
    (p) => !blockedIds.has(p.id)
  );

  // ── Curated buckets, carved from the post pool (no extra queries) ──
  const tagsOf = (p: any) =>
    ((p.hashtags ?? []) as string[]).map((t) =>
      t.replace(/^#/, "").toLowerCase()
    );

  // Interest-category rails — synonym buckets over the same pool
  const CATEGORY_DEFS: { label: string; tags: string[] }[] = [
    {
      label: "Technology",
      tags: [
        "tech",
        "technology",
        "coding",
        "code",
        "dev",
        "ai",
        "programming",
        "startup",
        "startups",
        "software",
      ],
    },
    {
      label: "Gaming",
      tags: [
        "gaming",
        "game",
        "games",
        "minecraft",
        "bedrock",
        "valorant",
        "gta",
        "fortnite",
        "esports",
      ],
    },
    {
      label: "Art & Design",
      tags: [
        "art",
        "design",
        "drawing",
        "sketch",
        "artist",
        "illustration",
        "animation",
      ],
    },
    {
      label: "Photography",
      tags: [
        "photo",
        "photography",
        "randompic",
        "picoftheday",
        "camera",
        "portrait",
      ],
    },
    {
      label: "Music",
      tags: ["music", "song", "rap", "singer", "playlist", "concert"],
    },
    { label: "Memes", tags: ["meme", "memes", "funny", "lol", "shitpost"] },
  ];
  const categoryRails = CATEGORY_DEFS.map(({ label, tags: catTags }) => {
    const set = new Set(catTags);
    const items = posts
      .filter((p: any) => tagsOf(p).some((t) => set.has(t)))
      .sort((a: any, b: any) => b._score - a._score)
      .slice(0, 40);
    return { label, posts: items };
  }).filter((c) => c.posts.length >= 2);

  return (
    <>
      {/* showBack because Discover is somewhere you navigate TO — from the
          compass on Home — not a tab you can simply be on. It was the only
          PageHeader in the app without it. */}
      <PageHeader title="Discover" showBack />
      <PullToRefresh>
        {/* Search lives inside DiscoverView now, on one row with the filter
            that replaced the category chips. */}
        <DiscoverView
          currentUserId={user.id}
          rankedPosts={rankedPosts}
          feedCursor={feedCursor}
          blockedIds={[...blockedIds]}
          trendingPosts={trendingPosts}
          trendingShots={trendingShots}
          feedShots={feedShots}
          people={(people ?? []) as any[]}
          newPeople={newPeople}
          categoryRails={categoryRails}
          tags={tags}
        />
      </PullToRefresh>
    </>
  );
}
