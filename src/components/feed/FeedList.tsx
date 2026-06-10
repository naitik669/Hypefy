"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FeedCard, type FeedPost } from "@/components/feed/FeedCard";

const PAGE_SIZE = 20;

/**
 * Client feed with infinite scroll. The server renders the first scored page;
 * scrolling past the sentinel appends the chronological tail (posts older
 * than everything currently shown).
 */
export function FeedList({
  initialPosts,
  currentUserId,
}: {
  initialPosts: FeedPost[];
  currentUserId: string;
}) {
  const supabase = createClient();
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initialPosts.length < 10);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  async function loadMore() {
    if (loadingRef.current || done) return;
    loadingRef.current = true;
    setLoading(true);

    const current = postsRef.current;
    const oldest = current.reduce(
      (min, p) => (p.created_at < min ? p.created_at : min),
      current[0]?.created_at ?? new Date().toISOString(),
    );

    const { data } = await supabase
      .from("posts")
      .select("*, profiles(id, display_name, username, avatar_hue, avatar_url, profile_tags)")
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    const fresh = (data ?? [])
      .map((p: any) => ({
        ...p,
        profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
      }))
      .filter((p: any) => !current.some((x) => x.id === p.id));

    if ((data?.length ?? 0) < PAGE_SIZE) setDone(true);

    if (fresh.length > 0) {
      // Initial hype/save state for the new batch
      const ids = fresh.map((p: any) => p.id);
      const [hypesRes, savedRes] = await Promise.all([
        supabase.from("hypes").select("target_id").eq("user_id", currentUserId).eq("target_type", "post").in("target_id", ids),
        supabase.from("saved_posts").select("post_id").eq("user_id", currentUserId).in("post_id", ids),
      ]);
      const hyped = new Set((hypesRes.data ?? []).map((h: any) => h.target_id));
      const saved = new Set((savedRes.data ?? []).map((s: any) => s.post_id));
      setPosts((prev) => [
        ...prev,
        ...fresh.map((p: any) => ({ ...p, initialHyped: hyped.has(p.id), initialSaved: saved.has(p.id) })),
      ]);
    }

    setLoading(false);
    loadingRef.current = false;
  }

  // Keep a ref of posts for loadMore without re-binding the observer
  const postsRef = useRef(posts);
  postsRef.current = posts;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  return (
    <div className="flex flex-col">
      {posts.map((post) => (
        <FeedCard key={post.id} post={post} currentUserId={currentUserId} />
      ))}

      {/* Sentinel + loading shimmer */}
      {!done && (
        <div ref={sentinelRef} className="px-4 py-6">
          {loading && (
            <div className="flex items-center gap-3">
              <div className="skeleton h-10 w-10 shrink-0 rounded-[30%]" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="skeleton h-3 w-1/3 rounded" />
                <div className="skeleton h-2.5 w-1/5 rounded" />
              </div>
            </div>
          )}
        </div>
      )}

      {done && posts.length > 10 && (
        <p className="py-8 text-center text-xs text-faint">You&apos;re all caught up ⚡</p>
      )}
    </div>
  );
}
