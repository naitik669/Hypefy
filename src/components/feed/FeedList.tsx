"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FeedCard, type FeedPost } from "@/components/feed/FeedCard";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import { haptics } from "@/lib/haptics";
import { Users } from "lucide-react";

const PAGE_SIZE = 20;
const SEEN_KEY = "hypefy_feed_seen";
const SEEN_CAP = 500;
const POST_SELECT =
  "*, profiles(id, display_name, username, avatar_hue, avatar_url, profile_tags, is_verified)";

/** Recently-seen post ids (capped ring in localStorage) — lets the
 *  chronological tail skip posts already shown in recent sessions. */
function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function saveSeen(seen: Set<string>) {
  try {
    const arr = [...seen].slice(-SEEN_CAP);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch { /* quota / private mode — non-fatal */ }
}

function normalize(data: unknown[] | null): FeedPost[] {
  return (data ?? []).map((p: any) => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
  })) as FeedPost[];
}

type Tab = "foryou" | "following";

/**
 * Home feed with a For You / Following toggle and infinite scroll.
 *
 * - **For You**: the server renders the first scored page; scrolling appends
 *   the chronological tail (posts older than everything currently shown).
 * - **Following**: lazily loaded the first time it's opened — posts from people
 *   you follow (plus your own), newest first, paginated by created_at.
 *
 * Switching tabs never refetches the shell (TopBar/Shows stay put); each tab
 * keeps its own loaded posts and scroll cursor.
 */
export function FeedList({
  initialPosts,
  currentUserId,
  followingIds = [],
}: {
  initialPosts: FeedPost[];
  currentUserId: string;
  followingIds?: string[];
}) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("foryou");

  // For You — seeded by the server.
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts);
  const [fyDone, setFyDone] = useState(initialPosts.length < 10);

  // Following — loaded client-side on first view.
  const [fwPosts, setFwPosts] = useState<FeedPost[]>([]);
  const [fwDone, setFwDone] = useState(false);
  const [fwInit, setFwInit] = useState(false); // first page attempted?

  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Refs mirror state so the observer callback always reads fresh values.
  const postsRef = useRef(posts); postsRef.current = posts;
  const fwPostsRef = useRef(fwPosts); fwPostsRef.current = fwPosts;
  const tabRef = useRef(tab); tabRef.current = tab;

  // Mark the initial (ranked) page as seen so the chronological tail won't
  // resurface them later.
  useEffect(() => {
    seenRef.current = loadSeen();
    initialPosts.forEach((p) => seenRef.current.add(p.id));
    saveSeen(seenRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Attach the current user's hype/save state to a freshly fetched batch. */
  async function withUserState(fresh: FeedPost[]): Promise<FeedPost[]> {
    if (fresh.length === 0) return fresh;
    const ids = fresh.map((p) => p.id);
    const [hypesRes, savedRes] = await Promise.all([
      supabase.from("hypes").select("target_id").eq("user_id", currentUserId).eq("target_type", "post").in("target_id", ids),
      supabase.from("saved_posts").select("post_id").eq("user_id", currentUserId).in("post_id", ids),
    ]);
    const hyped = new Set((hypesRes.data ?? []).map((h: any) => h.target_id));
    const saved = new Set((savedRes.data ?? []).map((s: any) => s.post_id));
    return fresh.map((p: any) => ({ ...p, initialHyped: hyped.has(p.id), initialSaved: saved.has(p.id) }));
  }

  async function loadMoreForYou() {
    const current = postsRef.current;
    const oldest = current.reduce(
      (min, p) => (p.created_at < min ? p.created_at : min),
      current[0]?.created_at ?? new Date().toISOString(),
    );
    const { data } = await supabase
      .from("posts").select(POST_SELECT)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    const fresh = normalize(data).filter(
      (p) => !current.some((x) => x.id === p.id) && !seenRef.current.has(p.id),
    );
    if ((data?.length ?? 0) < PAGE_SIZE) setFyDone(true);
    fresh.forEach((p) => seenRef.current.add(p.id));
    saveSeen(seenRef.current);
    if (fresh.length) {
      const withState = await withUserState(fresh);
      setPosts((prev) => [...prev, ...withState]);
    }
  }

  async function loadMoreFollowing() {
    const ids = followingIds.length ? [...followingIds, currentUserId] : [currentUserId];
    const current = fwPostsRef.current;
    let query = supabase
      .from("posts").select(POST_SELECT)
      .in("user_id", ids)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (current.length) {
      query = supabase
        .from("posts").select(POST_SELECT)
        .in("user_id", ids)
        .lt("created_at", current[current.length - 1].created_at)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
    }
    const { data } = await query;
    const fresh = normalize(data).filter((p) => !current.some((x) => x.id === p.id));
    if ((data?.length ?? 0) < PAGE_SIZE) setFwDone(true);
    if (fresh.length) {
      const withState = await withUserState(fresh);
      setFwPosts((prev) => [...prev, ...withState]);
    }
    if (!fwInit) setFwInit(true);
  }

  async function loadMore() {
    if (loadingRef.current) return;
    const t = tabRef.current;
    if (t === "foryou" && fyDone) return;
    if (t === "following" && fwDone) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      if (t === "foryou") await loadMoreForYou();
      else await loadMoreFollowing();
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }

  // Lazy-load the first Following page the first time that tab is opened.
  useEffect(() => {
    if (tab === "following" && !fwInit && !loadingRef.current) loadMore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Infinite-scroll sentinel — re-armed when the tab or its done-state changes.
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
  }, [tab, fyDone, fwDone]);

  function switchTab(next: Tab) {
    if (next === tab) return;
    haptics.tap();
    setTab(next);
    window.scrollTo({ top: 0 });
  }

  const activePosts = tab === "foryou" ? posts : fwPosts;
  const activeDone = tab === "foryou" ? fyDone : fwDone;
  const followingEmpty = tab === "following" && fwInit && fwPosts.length === 0;

  return (
    <div className="flex flex-col">
      {/* For You / Following toggle — sticks just under the TopBar */}
      <div className="sticky top-14 z-10 flex border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <TabButton label="For You" active={tab === "foryou"} onClick={() => switchTab("foryou")} />
        <TabButton label="Following" active={tab === "following"} onClick={() => switchTab("following")} />
      </div>

      {followingEmpty ? (
        <EmptyState
          icon={Users}
          title="Nothing here yet"
          text="Posts from people you follow show up here. Find a few creators to fill it up."
          ctaLabel="Find people"
          ctaHref="/discover"
        />
      ) : (
        activePosts.map((post, i) => (
          <Reveal key={`${tab}-${post.id}`} delay={Math.min(i, 4) * 55}>
            <FeedCard post={post} currentUserId={currentUserId} />
          </Reveal>
        ))
      )}

      {/* Sentinel + loading shimmer */}
      {!activeDone && !followingEmpty && (
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

      {activeDone && activePosts.length > 10 && (
        <p className="py-8 text-center text-xs text-faint">You&apos;re all caught up ⚡</p>
      )}
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-1 py-3 text-sm font-bold transition-colors ${
        active ? "text-foreground" : "text-muted hover:text-foreground/80"
      }`}
    >
      {label}
      <span
        className={`absolute inset-x-0 bottom-0 mx-auto h-0.5 w-10 rounded-full bg-accent transition-opacity duration-200 ${
          active ? "opacity-100" : "opacity-0"
        }`}
      />
    </button>
  );
}
