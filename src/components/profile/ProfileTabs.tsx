"use client";

import { useEffect, useState } from "react";
import { Grid3x3, Zap, Bookmark, PlusCircle, Video, Play } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { RichPostText } from "@/components/ui/RichPostText";

type Tab = "Posts" | "Shots" | "Saved";

const tabs: { key: Tab; Icon: typeof Grid3x3 }[] = [
  { key: "Posts", Icon: Grid3x3 },
  { key: "Shots", Icon: Zap },
  { key: "Saved", Icon: Bookmark },
];

type PostRow = { id: string; image_url: string | null; caption: string | null; created_at: string };
type ShotRow = { id: string; media_url: string; caption: string | null; created_at: string };

export function ProfileTabs({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>("Posts");
  const [posts, setPosts] = useState<PostRow[] | null>(null);
  const [shots, setShots] = useState<ShotRow[] | null>(null);
  const [saved, setSaved] = useState<PostRow[] | null>(null);
  const [savedShots, setSavedShots] = useState<ShotRow[] | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (tab === "Posts" && posts === null) loadPosts();
    if (tab === "Shots" && shots === null) loadShots();
    if (tab === "Saved" && saved === null) loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function loadPosts() {
    const { data } = await supabase
      .from("posts")
      .select("id, image_url, caption, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setPosts(data ?? []);
  }

  async function loadShots() {
    const { data } = await supabase
      .from("shots")
      .select("id, media_url, caption, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setShots(data ?? []);
  }

  async function loadSaved() {
    const [postsRes, shotsRes] = await Promise.all([
      supabase
        .from("saved_posts")
        .select("post_id, created_at, posts(id, image_url, caption, created_at)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("saved_shots")
        .select("shot_id, created_at, shots(id, media_url, caption, created_at)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
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
      {/* Tab bar */}
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
      {tab === "Posts" && (
        posts === null ? (
          <GridSkeleton />
        ) : posts.length === 0 ? (
          <EmptyState
            icon={PlusCircle}
            title="No posts yet"
            text="Your posts will show up here."
            ctaLabel="Create Post"
            ctaHref="/create/post"
          />
        ) : (
          <div className="grid grid-cols-3 gap-0.5">
            {posts.map((p) => (
              <PostThumb key={p.id} post={p} />
            ))}
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
            title="No Shots yet"
            text="Shots are short video reels."
            ctaLabel="Add Shot"
            ctaHref="/create/shot"
          />
        ) : (
          <div className="grid grid-cols-3 gap-0.5">
            {shots.map((s) => (
              <Link key={s.id} href="/shots" className="relative block aspect-[3/4] overflow-hidden bg-surface">
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
            text="Save posts and Shots you want to revisit."
          />
        ) : (
          <div className="grid grid-cols-3 gap-0.5">
            {saved.map((p) => (
              <PostThumb key={`p-${p.id}`} post={p} />
            ))}
            {savedShots.map((s) => (
              <Link
                key={`s-${s.id}`}
                href={`/shots/${s.id}`}
                className="relative block aspect-square overflow-hidden bg-surface"
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
        )
      )}
    </div>
  );
}

function PostThumb({ post }: { post: PostRow }) {
  if (post.image_url) {
    return (
      <div className="aspect-square overflow-hidden bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={post.image_url} alt={post.caption ?? "Post"} className="h-full w-full object-cover" />
      </div>
    );
  }
  // Text-only post — show caption preview
  return (
    <div className="aspect-square overflow-hidden bg-elevated p-2 flex items-start">
      <p className="line-clamp-4 text-[10px] leading-snug text-muted">
        <RichPostText text={post.caption ?? ""} />
      </p>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-0.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="aspect-square animate-pulse bg-surface" />
      ))}
    </div>
  );
}
