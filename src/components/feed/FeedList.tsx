"use client";

import { useEffect, useRef, useState } from "react";
import { Star, Heart, PlusCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FeedCard, type FeedPost } from "@/components/feed/FeedCard";
import { Reveal } from "@/components/ui/Reveal";
import { PeopleToFollow } from "@/components/feed/PeopleToFollow";
import { AddHypersPrompt } from "@/components/feed/AddHypersPrompt";
import { EmptyState } from "@/components/ui/EmptyState";
import { CaughtUp } from "@/components/feed/CaughtUp";
import { useFeedTab, type FeedTab } from "@/components/layout/FeedTabDropdown";

const PAGE_SIZE = 20;
const SEEN_KEY = "hypefy_feed_seen";
const SEEN_CAP = 500;
const POST_SELECT =
  "*, profiles!posts_user_id_fkey(id, display_name, username, avatar_hue, avatar_url, profile_tags, is_verified)";

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
  } catch { /* quota / private mode, non-fatal */ }
}

function normalize(data: unknown[] | null): FeedPost[] {
  return (data ?? []).map((p: any) => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
  })) as FeedPost[];
}

/** Every tab except For You is just "posts from this id list", newest first. */
type IdsTab = Exclude<FeedTab, "foryou">;
type IdsListState = { posts: FeedPost[]; done: boolean; init: boolean };
const EMPTY_IDS_STATE: IdsListState = { posts: [], done: false, init: false };

/**
 * Home feed. The active tab (For You / Following / Favourite / Hypers) comes
 * from the `?feed=` URL param via useFeedTab — the dropdown under the Hypefy
 * wordmark in TopBar writes that param, this component reads it, and the two
 * stay in sync without any shared client state or prop drilling.
 *
 * - **For You**: the server renders the first scored page; scrolling appends
 *   the chronological tail (posts older than everything currently shown).
 * - **Following / Favourite / Hypers**: each lazily loads its first page the
 *   first time it's opened — posts from the relevant id list (plus your own),
 *   newest first, paginated by created_at. Every tab keeps its own loaded
 *   posts, so switching back and forth doesn't re-fetch.
 */
export function FeedList({
  initialPosts,
  currentUserId,
  followingIds = [],
  favoriteIds = [],
  hyperIds = [],
  mutualHyperIds = [],
  blockedIds = [],
}: {
  initialPosts: FeedPost[];
  currentUserId: string;
  followingIds?: string[];
  favoriteIds?: string[];
  hyperIds?: string[];
  mutualHyperIds?: string[];
  blockedIds?: string[];
}) {
  const supabase = createClient();
  const tab = useFeedTab();
  // Authors the viewer has blocked — pagination batches skip them too.
  const blockedSet = new Set(blockedIds);
  // Hyper status resolved once per page (avoids a close_friends query per card).
  const hyperSet = new Set(hyperIds);
  const mutualHyperSet = new Set(mutualHyperIds);

  // For You — seeded by the server.
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts);
  const [fyDone, setFyDone] = useState(initialPosts.length < 10);

  // Following / Favourite / Hypers — each lazily loaded client-side.
  const [idsState, setIdsState] = useState<Record<IdsTab, IdsListState>>({
    following: EMPTY_IDS_STATE,
    favourite: EMPTY_IDS_STATE,
    hypers: EMPTY_IDS_STATE,
  });
  const idsByTab: Record<IdsTab, string[]> = {
    following: followingIds,
    favourite: favoriteIds,
    hypers: hyperIds,
  };

  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Refs mirror state so the observer callback always reads fresh values.
  const postsRef = useRef(posts); postsRef.current = posts;
  const idsStateRef = useRef(idsState); idsStateRef.current = idsState;
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
      (p) => !current.some((x) => x.id === p.id) && !seenRef.current.has(p.id) && !blockedSet.has(p.user_id),
    );
    if ((data?.length ?? 0) < PAGE_SIZE) setFyDone(true);
    fresh.forEach((p) => seenRef.current.add(p.id));
    saveSeen(seenRef.current);
    if (fresh.length) {
      const withState = await withUserState(fresh);
      setPosts((prev) => [...prev, ...withState]);
    }
  }

  async function loadMoreIdsTab(t: IdsTab) {
    // Following/Hypers scope strictly to those people — showing your own
    // posts there just crowds out the "nothing here yet" prompts. Favourite
    // keeps the old behavior (includes your own posts) since it's unchanged.
    const scopeIds = t === "favourite"
      ? (idsByTab[t].length ? [...idsByTab[t], currentUserId] : [currentUserId])
      : idsByTab[t];

    if (scopeIds.length === 0) {
      setIdsState((prev) => ({ ...prev, [t]: { posts: [], done: true, init: true } }));
      return;
    }

    const current = idsStateRef.current[t].posts;
    let query = supabase
      .from("posts").select(POST_SELECT)
      .in("user_id", scopeIds)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (current.length) {
      query = supabase
        .from("posts").select(POST_SELECT)
        .in("user_id", scopeIds)
        .lt("created_at", current[current.length - 1].created_at)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
    }
    const { data } = await query;
    const fresh = normalize(data).filter((p) => !current.some((x) => x.id === p.id) && !blockedSet.has(p.user_id));
    const nowDone = (data?.length ?? 0) < PAGE_SIZE;
    const withState = fresh.length ? await withUserState(fresh) : fresh;
    setIdsState((prev) => ({
      ...prev,
      [t]: { posts: [...prev[t].posts, ...withState], done: nowDone || prev[t].done, init: true },
    }));
  }

  async function loadMore() {
    if (loadingRef.current) return;
    const t = tabRef.current;
    if (t === "foryou" ? fyDone : idsStateRef.current[t].done) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      if (t === "foryou") await loadMoreForYou();
      else await loadMoreIdsTab(t);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }

  // Lazy-load the first page of an ids-tab the first time it's opened.
  useEffect(() => {
    if (tab !== "foryou" && !idsStateRef.current[tab].init && !loadingRef.current) loadMore();
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
  }, [tab, fyDone, idsState.following.done, idsState.favourite.done, idsState.hypers.done]);

  // Scroll to top whenever the tab actually changes (not on the initial mount).
  const prevTabRef = useRef(tab);
  useEffect(() => {
    if (prevTabRef.current !== tab) {
      window.scrollTo({ top: 0 });
      prevTabRef.current = tab;
    }
  }, [tab]);

  const activePosts = tab === "foryou" ? posts : idsState[tab].posts;
  const activeDone = tab === "foryou" ? fyDone : idsState[tab].done;
  const idsEmpty = tab !== "foryou" && idsState[tab].init && idsState[tab].posts.length === 0;
  // Zero Hypers picked takes priority over post content — otherwise a user's
  // own posts (always included in the scope query) would mask the empty state.
  const noHypersPicked = tab === "hypers" && hyperIds.length === 0;

  return (
    <div className="flex flex-col">
      {noHypersPicked ? (
        <AddHypersPrompt currentUserId={currentUserId} />
      ) : idsEmpty ? (
        tab === "following" ? (
          <PeopleToFollow
            currentUserId={currentUserId}
            followingIds={followingIds}
            heading="Nothing here yet"
            sub="Follow people and their posts land right here."
          />
        ) : (
          <EmptyIdsTab tab={tab} />
        )
      ) : (
        activePosts.map((post, i) => (
          <Reveal key={`${tab}-${post.id}`} delay={Math.min(i, 4) * 55}>
            <FeedCard
              post={post}
              currentUserId={currentUserId}
              initialIsHyper={hyperSet.has(post.user_id)}
              initialIsMutualHyper={mutualHyperSet.has(post.user_id)}
            />
          </Reveal>
        ))
      )}

      {/* Sentinel + loading shimmer */}
      {!activeDone && !idsEmpty && !noHypersPicked && (
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

      {!noHypersPicked && tab !== "foryou" && activeDone && activePosts.length > 10 && (
        <CaughtUp />
      )}

      {/* End of the For You road — once the posts run out, close the feed
          with the caught-up moment + people to follow, never a dead screen. */}
      {tab === "foryou" && fyDone && (
        <div className={posts.length > 0 ? "border-t border-border/60" : ""}>
          {posts.length === 0 ? (
            <EmptyState
              icon={PlusCircle}
              title="Your feed is warming up"
              text="Follow people or drop a post, someone has to start the hype."
              ctaLabel="Create Post"
              ctaHref="/create/post"
              variant="compact"
            />
          ) : (
            <CaughtUp />
          )}
          <PeopleToFollow currentUserId={currentUserId} followingIds={followingIds} />
        </div>
      )}
    </div>
  );
}

function EmptyIdsTab({ tab }: { tab: "favourite" | "hypers" }) {
  const isHyper = tab === "hypers";
  const Icon = isHyper ? Star : Heart;
  return (
    <div className="animate-rise flex flex-col items-center justify-center gap-3 px-8 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-muted">
        <Icon size={28} />
      </div>
      <h2 className="text-lg font-bold">{isHyper ? "No Hypers yet" : "No Favourites yet"}</h2>
      <p className="max-w-xs text-sm text-muted">
        Visit someone&apos;s profile and tap the ⋯ menu to add them as {isHyper ? "a Hyper" : "a Favourite"}.
      </p>
    </div>
  );
}
