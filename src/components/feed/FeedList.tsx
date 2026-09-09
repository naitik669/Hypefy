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
import { loadSeen, saveSeen } from "@/lib/feed-seen";
import { rankBatch } from "@/lib/feed-rank";
import {
  spliceFeed,
  placeAds,
  AD_DEFAULTS,
  type PlacedShot,
  type PlacedAd,
  type ShotCard,
} from "@/lib/feed-mix";
import { ShotFeedCard } from "@/components/feed/ShotFeedCard";
import { AdFeedCard } from "@/components/feed/AdFeedCard";
import {
  adFill,
  adBudgetLeft,
  noteAdShown,
  type AdFill,
} from "@/lib/ads";
import { isNative } from "@/lib/native";

const PAGE_SIZE = 20;
const POST_SELECT =
  "*, profiles!posts_user_id_fkey(id, display_name, username, avatar_hue, avatar_url, profile_tags, is_verified)";


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
  initialShots = [],
  currentUserId,
  followingIds = [],
  favoriteIds = [],
  hyperIds = [],
  mutualHyperIds = [],
  blockedIds = [],
  adCountry = null,
  adPersonalised = false,
}: {
  initialPosts: FeedPost[];
  /** Shots already scored and slotted by the server (For You only). */
  initialShots?: PlacedShot<ShotCard>[];
  currentUserId: string;
  followingIds?: string[];
  favoriteIds?: string[];
  hyperIds?: string[];
  mutualHyperIds?: string[];
  blockedIds?: string[];
  /** The reader's country, resolved on the server. Null means unknown. */
  adCountry?: string | null;
  /** Confirmed 18+. Computed server-side from date_of_birth; null is a no. */
  adPersonalised?: boolean;
}) {
  const supabase = createClient();
  const tab = useFeedTab();
  // Authors the viewer has blocked — pagination batches skip them too.
  const blockedSet = new Set(blockedIds);
  // Authors the viewer follows — the tail ranker needs this to award the
  // social bonus, exactly as the server does for the first page.
  const followingSet = new Set(followingIds);
  // Hyper status resolved once per page (avoids a close_friends query per card).
  const hyperSet = new Set(hyperIds);
  const mutualHyperSet = new Set(mutualHyperIds);

  // For You — seeded by the server.
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts);
  const [shots, setShots] = useState<PlacedShot<ShotCard>[]>(initialShots);
  const [fyDone, setFyDone] = useState(initialPosts.length < PAGE_SIZE);

  // Ads. Placed entirely client-side, after mount, and never server-rendered:
  // isNative() answers false during SSR because Capacitor is absent there, so
  // a server-rendered slot would ship an ad tag into the Play Store app and
  // then have to take it back out. The gate has to run where it can tell.
  const [ads, setAds] = useState<PlacedAd[]>([]);
  const [fill, setFill] = useState<AdFill>("off");
  // Where the next ad may start, and how many have been minted. Append-only:
  // recomputing placement from scratch on every page would move an ad the
  // reader has already scrolled past, which remounts the unit — a second
  // request, a double-counted impression, and a jump above the scroll.
  const adCursor = useRef({ nextSlot: 0, count: 0 });
  // Bumped on refresh so the new slots get new ids and new units.
  const adEpoch = useRef(0);

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

  // Re-sync the For You slice whenever the server sends a fresh ranked page.
  // `initialPosts` is a new array reference on mount AND whenever router.refresh()
  // re-runs the server query (pull-to-refresh, Back to top) — home/page.tsx reads
  // no searchParams, so switching feed tabs never re-invokes the server component
  // and can't spuriously trigger this. Without this effect, `posts` was seeded
  // once via useState(initialPosts) and never updated again: a refresh re-ran the
  // server query but the visible list stayed frozen on the first load.
  useEffect(() => {
    setPosts(initialPosts);
    // Shots need the identical treatment for the identical reason. Without
    // this line they would be seeded once and then freeze, while the posts
    // around them refreshed — the same bug the comment above describes, and
    // more confusing here because the stale cards would be video.
    setShots(initialShots);
    setFyDone(initialPosts.length < PAGE_SIZE);
    // A refresh is a genuinely new page view, so the ad slots start over:
    // new positions, new ids, new units. Carrying the old ones across would
    // leave a unit that has already been requested sitting next to posts it
    // was never placed against.
    setAds([]);
    adCursor.current = { nextSlot: 0, count: 0 };
    adEpoch.current += 1;
    // Mark the ranked page as seen so the chronological tail won't resurface it.
    seenRef.current = loadSeen();
    initialPosts.forEach((p) => seenRef.current.add(p.id));
    saveSeen(seenRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPosts]);

  // What may fill a slot for this reader. Resolved after mount because
  // isNative() is only truthful in a browser.
  useEffect(() => {
    setFill(adFill({ country: adCountry, native: isNative() }));
  }, [adCountry]);

  // Place ads as the feed grows.
  //
  // Unlike shots — which arrive as a server prop and are therefore stuck on
  // page one — an ad carries no server data, so it can be placed against
  // whatever is currently loaded. Appends only, never renumbers.
  useEffect(() => {
    if (tab !== "foryou" || fill === "off") return;
    const budget = adBudgetLeft();
    if (budget <= 0) return;

    setAds((prev) => {
      const fresh = placeAds(
        posts.length,
        shots.map((shot) => shot.slot),
        {
          startAfter: adCursor.current.nextSlot,
          startIndex: adCursor.current.count,
          idPrefix: `ad-${adEpoch.current}-`,
          max: Math.min(AD_DEFAULTS.max, budget),
        }
      );
      if (fresh.length === 0) return prev;
      adCursor.current = {
        nextSlot: fresh[fresh.length - 1].slot + AD_DEFAULTS.every,
        count: adCursor.current.count + fresh.length,
      };
      return [...prev, ...fresh];
    });
  }, [posts.length, shots, tab, fill]);

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
    const { data, error } = await supabase
      .from("posts").select(POST_SELECT)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    // A failed page is not the end of the feed.
    //
    // `error` was not destructured here, so on failure `data` was null, the
    // length check below read 0 < PAGE_SIZE, and fyDone latched true — the
    // feed showed "You're all caught up" permanently, until a full reload.
    // The reader's interpretation of that is "this app has nothing", which is
    // a much worse thing to believe than "that didn't load".
    if (error) return;

    // Only the two filters that are correctness rather than preference:
    // don't show the same post twice, and don't show blocked authors.
    //
    // The seen ring is deliberately NOT filtered here any more. It used to be,
    // and it made the tail return nothing: the re-sync effect above adds all
    // 30 ranked ids to the ring before the reader has scrolled at all, so the
    // whole first page was already "seen" and every one of these rows was
    // dropped — after the limit had been spent on them. Seen posts are already
    // pushed down by feedScore's -25; filtering them again is double jeopardy,
    // and on a corpus this size it empties the feed.
    const fresh = normalize(data).filter(
      (p) => !current.some((x) => x.id === p.id) && !blockedSet.has(p.user_id),
    );
    if ((data?.length ?? 0) < PAGE_SIZE) setFyDone(true);

    if (fresh.length) {
      // Rank the tail. Without this the feed changed character at post 30 —
      // ranked above, raw reverse-chronological below.
      //
      // Scored against the ring as it stands BEFORE this batch joins it.
      // Adding them first would mark every one of them seen and apply the
      // same -25 to all, which is no ordering at all.
      const ranked = rankBatch(fresh, {
        currentUserId,
        following: followingSet,
        seen: new Set(seenRef.current),
      });
      const withState = await withUserState(ranked);
      setPosts((prev) => [...prev, ...withState]);
    }

    fresh.forEach((p) => seenRef.current.add(p.id));
    saveSeen(seenRef.current);
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
    const { data, error } = await query;
    // Same reasoning as the For You tail: a failed page must not latch `done`
    // and turn a network blip into a permanent end-of-feed.
    if (error) return;
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
        // Shots are spliced in at RENDER only, and only on For You. `posts`
        // stays a plain FeedPost[] so every post-keyed path in this file —
        // withUserState's .in() lookups, the seen ring, the `oldest` cursor,
        // initialHyped/initialSaved — keeps working on post ids alone.
        spliceFeed(
          activePosts,
          tab === "foryou" ? shots : [],
          tab === "foryou" ? ads : []
        ).map((item, i) =>
          item.kind === "ad" ? (
            // No content-visibility here, unlike its neighbours. It skips
            // layout for off-screen subtrees, and an AdSense creative is an
            // iframe that measures and resizes itself after load — the two
            // race exactly at the viewport boundary, which is the worst
            // possible moment for a shift. There are at most two of these on
            // a page, so the virtualisation was never worth anything.
            <Reveal key={item.ad.id} delay={Math.min(i, 4) * 55}>
              <AdFeedCard
                ad={item.ad}
                fill={fill}
                personalised={adPersonalised}
                onSeen={noteAdShown}
              />
            </Reveal>
          ) : item.kind === "shot" ? (
            <Reveal
              key={`shot-${item.shot.id}`}
              delay={Math.min(i, 4) * 55}
              // Taller than a post card, so it needs its own placeholder size —
              // reusing 480px makes the scroll anchor jump as it resolves.
              className="[content-visibility:auto] [contain-intrinsic-size:auto_560px]"
            >
              <ShotFeedCard shot={item.shot} currentUserId={currentUserId} />
            </Reveal>
          ) : (
            <Reveal
              key={`${tab}-${item.post.id}`}
              delay={Math.min(i, 4) * 55}
              // content-visibility virtualizes: off-screen cards skip layout+paint
              className="[content-visibility:auto] [contain-intrinsic-size:auto_480px]"
            >
              <FeedCard
                post={item.post}
                currentUserId={currentUserId}
                initialIsHyper={hyperSet.has(item.post.user_id)}
                initialIsMutualHyper={mutualHyperSet.has(item.post.user_id)}
              />
            </Reveal>
          )
        )
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
        <CaughtUp count={activePosts.length} />
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
            <CaughtUp count={posts.length} />
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
