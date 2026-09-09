import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { FeedCard, type FeedPost } from "@/components/feed/FeedCard";
import { JoinBanner } from "@/components/growth/JoinBanner";
import { ViewPing } from "@/components/feed/ViewPing";

type Thumb = {
  id: string;
  image_url: string | null;
  image_urls: string[] | null;
  caption: string | null;
};

function cover(p: Thumb): string | null {
  return p.image_url ?? p.image_urls?.[0] ?? null;
}

// Shared between generateMetadata and the page render (React cache dedupes
// within a single request), so the OG tags don't cost an extra round-trip.
const getPostWithAuthor = cache(async (postId: string) => {
  const supabase = await createClient();
  const { data: raw } = await supabase
    .from("posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle();
  if (!raw) return null;
  const { data: ownerProf } = await supabase
    .from("profiles")
    .select(
      "id, display_name, username, avatar_hue, avatar_url, profile_tags, is_verified"
    )
    .eq("id", (raw as any).user_id)
    .maybeSingle();
  return { raw: raw as any, ownerProf: ownerProf as any };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ postId: string }>;
}): Promise<Metadata> {
  const { postId } = await params;
  const result = await getPostWithAuthor(postId);
  if (!result) return {};
  const { raw, ownerProf } = result;
  const username = ownerProf?.username ?? null;
  const title = username ? `@${username} on Hypefy` : "Post on Hypefy";
  const description =
    (raw.caption as string | null) ??
    (raw.body as string | null)?.slice(0, 160) ??
    "Where your personality lives.";
  const image =
    (raw.image_url as string | null) ??
    (raw.image_urls as string[] | null)?.[0] ??
    null;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function PostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ postId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { postId } = await params;
  // ?comment=<id> opens the thread on that comment. Notifications about a
  // comment used to have nowhere to land: a comment is not a route, so
  // notifHref sent them to the post with the sheet closed.
  const sp = await searchParams;
  const commentParam = sp.comment;
  const focusCommentId = typeof commentParam === "string" ? commentParam : null;
  /**
   * Opened from a profile grid, so the thing below this post should be the
   * REST OF THAT PROFILE in order — not a pair of recommendation shelves.
   *
   * Tapping a grid tile is a way of entering a body of work at a point. The
   * question it asks is "what else is here", and the answer to that is the
   * next post down, not a thumbnail of something twelve posts away that you
   * then have to tap again. Every other way in — a share link, a
   * notification, a mention — keeps the shelves, because there the post is
   * the destination rather than a doorway.
   */
  const fromProfile = sp.from === "profile";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? "";

  // The single target post (this is what an embed/chat link should open).
  const result = await getPostWithAuthor(postId);
  if (!result) notFound();
  const { raw, ownerProf } = result;
  const ownerId = (raw as any).user_id as string;
  const isOwn = uid === ownerId;

  // Can the viewer see the owner's other posts? (private + non-follower → no)
  let canSeeMore = isOwn;
  if (!canSeeMore) {
    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("is_private")
      .eq("id", ownerId)
      .maybeSingle();
    if (!ownerProfile?.is_private) canSeeMore = true;
    else if (uid) {
      const { data: followRow } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", uid)
        .eq("following_id", ownerId)
        .maybeSingle();
      canSeeMore = !!followRow;
    }
  }

  // Hype/save state for the target post
  const [hypeRes, saveRes] = uid
    ? await Promise.all([
        supabase
          .from("hypes")
          .select("target_id")
          .eq("user_id", uid)
          .eq("target_type", "post")
          .eq("target_id", postId)
          .maybeSingle(),
        supabase
          .from("saved_posts")
          .select("post_id")
          .eq("user_id", uid)
          .eq("post_id", postId)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  const post: FeedPost = {
    ...(raw as any),
    profiles: (ownerProf as any) ?? null,
    initialHyped: !!hypeRes.data,
    initialSaved: !!saveRes.data,
  };
  const username = post.profiles?.username ?? null;
  const hashtags = ((raw as any).hashtags ?? []) as string[];

  /**
   * The rest of this author's posts, older than the one that was tapped.
   *
   * Older only, deliberately: the grid is newest-first, so everything NEWER
   * than the tapped post is what you already scrolled past to reach it.
   * Putting it below would make the reading order disagree with the grid you
   * came from.
   *
   * A plain `lt` on created_at, matching the keyset SavedView already uses.
   * A composite (created_at, id) cursor would be more rigorous, but it has to
   * go through PostgREST's `or=(...,and(...))` syntax with a timestamp inside
   * it — and created_at carries a `+` for the timezone, which is exactly the
   * character URL encoding is worst at. That is a real risk taken to solve a
   * problem that needs two posts to share a MICROSECOND. The id filter below
   * covers the only case that matters in practice.
   */
  let authorFeed: FeedPost[] = [];
  if (fromProfile && canSeeMore) {
    const { data: older } = await supabase
      .from("posts")
      .select("*")
      .eq("user_id", ownerId)
      .lte("created_at", (raw as any).created_at as string)
      // lte rather than lt, plus this: a post sharing the exact timestamp is
      // kept, and the one being read is excluded by id instead of by time.
      .neq("id", postId)
      .order("created_at", { ascending: false })
      .limit(10);

    const rows = (older ?? []) as Record<string, unknown>[];
    if (rows.length > 0) {
      // One batched lookup for the whole run, rather than a query per card.
      const ids = rows.map((r) => r.id as string);
      const [hypes, saves] = uid
        ? await Promise.all([
            supabase
              .from("hypes")
              .select("target_id")
              .eq("user_id", uid)
              .eq("target_type", "post")
              .in("target_id", ids),
            supabase
              .from("saved_posts")
              .select("post_id")
              .eq("user_id", uid)
              .in("post_id", ids),
          ])
        : [{ data: [] }, { data: [] }];
      const hyped = new Set(
        ((hypes.data ?? []) as { target_id: string }[]).map((h) => h.target_id)
      );
      const saved = new Set(
        ((saves.data ?? []) as { post_id: string }[]).map((s) => s.post_id)
      );

      authorFeed = rows.map((r) => ({
        ...(r as unknown as FeedPost),
        // Same author throughout, so the profile already in hand is reused
        // rather than re-fetched per row.
        profiles: (ownerProf as FeedPost["profiles"]) ?? null,
        initialHyped: hyped.has(r.id as string),
        initialSaved: saved.has(r.id as string),
      }));
    }
  }

  // "More from @username" + "More like this" — only when the viewer may see
  // more, and only when this post is a destination rather than a doorway.
  let moreFrom: Thumb[] = [];
  let moreLike: Thumb[] = [];
  if (canSeeMore && !fromProfile) {
    const [fromRes, likeRes] = await Promise.all([
      supabase
        .from("posts")
        .select("id, image_url, image_urls, caption")
        .eq("user_id", ownerId)
        .neq("id", postId)
        .order("created_at", { ascending: false })
        .limit(12),
      hashtags.length > 0
        ? supabase
            .from("posts")
            .select("id, image_url, image_urls, caption")
            .overlaps("hashtags", hashtags)
            .neq("user_id", ownerId)
            .neq("id", postId)
            .order("hype_count", { ascending: false })
            .limit(12)
        : supabase
            .from("posts")
            .select("id, image_url, image_urls, caption")
            .neq("user_id", ownerId)
            .neq("id", postId)
            .order("hype_count", { ascending: false })
            .limit(12),
    ]);
    moreFrom = (fromRes.data ?? []) as Thumb[];
    moreLike = (likeRes.data ?? []) as Thumb[];
  }

  return (
    <>
      <PageHeader title="Post" showBack />
      <ViewPing postId={postId} />
      <FeedCard
        post={post}
        currentUserId={uid}
        focusCommentId={focusCommentId}
      />

      {authorFeed.map((p) => (
        <FeedCard key={p.id} post={p} currentUserId={uid} />
      ))}

      {/* The run is capped, so there has to be a way onward from the bottom
          of it rather than a dead stop. */}
      {fromProfile && authorFeed.length === 10 && username && (
        <div className="px-4 py-6 text-center">
          <Link
            href={`/u/${username}`}
            className="inline-flex h-11 items-center rounded-pill border border-border bg-surface px-5 text-sm font-bold transition-colors hover:bg-elevated"
          >
            See all of @{username}&apos;s posts
          </Link>
        </div>
      )}

      {moreFrom.length > 0 && (
        <ThumbSection
          title={username ? `More from @${username}` : "More from this person"}
          items={moreFrom}
        />
      )}
      {moreLike.length > 0 && (
        <ThumbSection title="More like this" items={moreLike} />
      )}

      {!user && <JoinBanner />}
    </>
  );
}

function ThumbSection({ title, items }: { title: string; items: Thumb[] }) {
  return (
    <section className="mt-2 border-t border-border/60 pt-3">
      <h2 className="px-4 pb-2 text-sm font-bold tracking-tight">{title}</h2>
      <div className="grid grid-cols-3 gap-1.5 px-1.5 pb-2">
        {items.map((p) => {
          const c = cover(p);
          return (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              className="relative block aspect-square overflow-hidden rounded-xl bg-surface"
            >
              {c ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c}
                  alt={p.caption ?? "Post"}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-end p-2">
                  <p className="line-clamp-3 text-[10px] text-muted">
                    {p.caption ?? ""}
                  </p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
