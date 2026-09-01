"use client";

import { useEffect, useRef, useState } from "react";
import { Grid3x3, Zap, Bookmark, PlusCircle, Video, Play } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { RichPostText } from "@/components/ui/RichPostText";
import { CollectionsStrip } from "@/components/profile/CollectionsStrip";
import { GRID, GRID_WRAP, isTall } from "@/components/profile/postGrid";

type Tab = "Posts" | "Shots" | "Saved";

const tabs: { key: Tab; Icon: typeof Grid3x3 }[] = [
  { key: "Posts", Icon: Grid3x3 },
  { key: "Shots", Icon: Zap },
  { key: "Saved", Icon: Bookmark },
];

type PostRow = { id: string; image_url: string | null; image_urls?: string[] | null; caption: string | null; created_at: string; aspect_ratio?: number | null };
type ShotRow = { id: string; media_url: string; caption: string | null; created_at: string };

const PAGE = 30; // items per page

export function ProfileTabs({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>("Posts");
  const [posts, setPosts] = useState<PostRow[] | null>(null);
  const [postsHasMore, setPostsHasMore] = useState(true);
  const [shots, setShots] = useState<ShotRow[] | null>(null);
  const [shotsHasMore, setShotsHasMore] = useState(true);
  const [saved, setSaved] = useState<PostRow[] | null>(null);
  const [savedShots, setSavedShots] = useState<ShotRow[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const postsSentinel = useRef<HTMLDivElement>(null);
  const shotsSentinel = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    if (tab === "Posts" && posts === null) loadPosts();
    if (tab === "Shots" && shots === null) loadShots();
    if (tab === "Saved" && saved === null) loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // IntersectionObserver for Posts
  useEffect(() => {
    if (tab !== "Posts" || !postsHasMore || posts === null) return;
    const el = postsSentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) loadMorePosts(); }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, postsHasMore, posts]);

  // IntersectionObserver for Shots
  useEffect(() => {
    if (tab !== "Shots" || !shotsHasMore || shots === null) return;
    const el = shotsSentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) loadMoreShots(); }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, shotsHasMore, shots]);

  async function loadPosts() {
    const { data } = await supabase
      .from("posts")
      .select("id, image_url, image_urls, caption, created_at, aspect_ratio")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    setPosts(data ?? []);
    setPostsHasMore((data ?? []).length === PAGE);
  }

  async function loadMorePosts() {
    if (loadingMore || !posts) return;
    setLoadingMore(true);
    const oldest = posts[posts.length - 1]?.created_at;
    if (!oldest) { setLoadingMore(false); return; }
    const { data } = await supabase
      .from("posts")
      .select("id, image_url, image_urls, caption, created_at, aspect_ratio")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .lt("created_at", oldest)
      .limit(PAGE);
    setPosts((prev) => [...(prev ?? []), ...(data ?? [])]);
    setPostsHasMore((data ?? []).length === PAGE);
    setLoadingMore(false);
  }

  async function loadShots() {
    const { data } = await supabase
      .from("shots")
      .select("id, media_url, caption, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    setShots(data ?? []);
    setShotsHasMore((data ?? []).length === PAGE);
  }

  async function loadMoreShots() {
    if (loadingMore || !shots) return;
    setLoadingMore(true);
    const oldest = shots[shots.length - 1]?.created_at;
    if (!oldest) { setLoadingMore(false); return; }
    const { data } = await supabase
      .from("shots")
      .select("id, media_url, caption, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .lt("created_at", oldest)
      .limit(PAGE);
    setShots((prev) => [...(prev ?? []), ...(data ?? [])]);
    setShotsHasMore((data ?? []).length === PAGE);
    setLoadingMore(false);
  }

  async function loadSaved() {
    const [postsRes, shotsRes] = await Promise.all([
      supabase
        .from("saved_posts")
        .select("post_id, created_at, posts(id, image_url, image_urls, caption, created_at, aspect_ratio)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(PAGE),
      supabase
        .from("saved_shots")
        .select("shot_id, created_at, shots(id, media_url, caption, created_at)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(PAGE),
    ]);
    const postRows = (postsRes.data ?? []).flatMap((row: { posts: PostRow | PostRow[] | null }) => {
      const p = row.posts;
      if (!p) return [];
      return Array.isArray(p) ? p : [p];
    });
    setSaved(postRows);
    const shotRows = (shotsRes.data ?? []).flatMap((row: { shots: ShotRow | ShotRow[] | null }) => {
      const s = row.shots;
      if (!s) return [];
      return Array.isArray(s) ? s : [s];
    });
    setSavedShots(shotRows);
  }

  return (
    <div className="mt-2">
      {/* Tab bar — thin hairline dividers, blends with the page background */}
      <div className="sticky top-14 z-10 flex border-y border-border bg-background/90 backdrop-blur-xl">
        {tabs.map(({ key, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-sm font-semibold transition-colors ${
              tab === key ? "border-accent text-foreground" : "border-transparent text-muted"
            }`}
          >
            <Icon size={16} />
            {key}
          </button>
        ))}
      </div>

      {/* Posts grid */}
      <div key={tab} className="animate-fade-swap mt-3">
      {tab === "Posts" && (
        posts === null ? (
          <GridSkeleton />
        ) : posts.length === 0 ? (
          <EmptyState
            icon={PlusCircle}
            title="Nothing posted yet"
            text="Your posts live here. Make some noise."
            ctaLabel="Create Post"
            ctaHref="/create/post"
          />
        ) : (
          <div>
            <div className={GRID_WRAP}>
              <div className={GRID}>
                {posts.map((p) => (
                  <PostThumb key={p.id} post={p} />
                ))}
              </div>
            </div>
            {postsHasMore && <div ref={postsSentinel} className="h-8" />}
          </div>
        )
      )}

      {/* Shots grid */}
      {tab === "Shots" && (
        shots === null ? (
          <GridSkeleton />
        ) : shots.length === 0 ? (
          <EmptyState
            icon={Video}
            title="No Shots fired"
            text="Short videos, big energy. Post your first."
            ctaLabel="Add Shot"
            ctaHref="/create/shot"
          />
        ) : (
          <div>
          <div className="grid grid-cols-3 gap-1.5 px-1.5">
            {shots.map((s) => (
              <Link key={s.id} href={`/shots/${s.id}`} className="relative block aspect-[3/4] overflow-hidden rounded-xl bg-surface">
                <video
                  src={s.media_url}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
                <span className="absolute right-1.5 top-1.5 text-white drop-shadow">
                  <Play size={14} className="fill-white" />
                </span>
              </Link>
            ))}
          </div>
          {shotsHasMore && <div ref={shotsSentinel} className="h-8" />}
          </div>
        )
      )}

      {/* Saved — posts + shots */}
      {tab === "Saved" && (
        saved === null || savedShots === null ? (
          <GridSkeleton />
        ) : saved.length === 0 && savedShots.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="Nothing saved yet"
            text="Stash the posts and Shots you'll want back."
          />
        ) : (
          <>
          <CollectionsStrip userId={userId} savedPosts={saved} />
          <div className={GRID_WRAP}>
            <div className={GRID}>
              {saved.map((p) => (
                <PostThumb key={`p-${p.id}`} post={p} />
              ))}
              {savedShots.map((s) => (
                <Link
                  key={`s-${s.id}`}
                  href={`/shots/${s.id}`}
                  className="relative block h-full overflow-hidden rounded-xl bg-surface"
                >
                  <video
                    src={s.media_url}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <span className="absolute right-1.5 top-1.5 text-white drop-shadow">
                    <Play size={14} className="fill-white" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
          </>
        )
      )}
      </div>
    </div>
  );
}

function PostThumb({ post }: { post: PostRow }) {
  const cover = post.image_url ?? post.image_urls?.[0] ?? null;
  const tall = isTall(post.aspect_ratio);
  return (
    <Link
      href={`/p/${post.id}`}
      style={tall ? { gridRow: "span 2" } : undefined}
      className="relative block h-full overflow-hidden rounded-xl bg-surface"
    >
      {cover ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt={post.caption ?? "Post"} className="h-full w-full object-cover" />
          {(post.image_urls?.length ?? 0) > 1 && (
            <span className="absolute right-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
              {post.image_urls!.length}
            </span>
          )}
        </>
      ) : (
        <div className="flex h-full items-start bg-elevated p-2">
          <p className="line-clamp-4 text-[10px] leading-snug text-muted">
            <RichPostText text={post.caption ?? ""} />
          </p>
        </div>
      )}
    </Link>
  );
}

function GridSkeleton() {
  // Mirrors the real grid's rhythm, including a tall tile, so the layout
  // does not visibly reflow when the posts land.
  const tallAt = new Set([1, 3]);
  return (
    <div className={GRID_WRAP}>
      <div className={GRID}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={tallAt.has(i) ? { gridRow: "span 2" } : undefined}
            className="h-full animate-pulse rounded-xl bg-surface"
          />
        ))}
      </div>
    </div>
  );
}
