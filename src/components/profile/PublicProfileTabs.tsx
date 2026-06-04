"use client";

import { useEffect, useState } from "react";
import { Grid3x3, Zap, Bookmark, PlusCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { FeedCard, type FeedPost } from "@/components/feed/FeedCard";
import { PostViewerModal } from "@/components/profile/PostViewerModal";
import { EmptyState } from "@/components/ui/EmptyState";

type Tab = "Posts" | "Shots" | "Saved";

function getThumb(post: any): string | null {
  if (post.image_urls?.length) return post.image_urls[0];
  if (post.image_url) return post.image_url;
  return null;
}

function normPost(p: any): FeedPost {
  return {
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
  };
}

export function PublicProfileTabs({
  userId, isOwn, currentUserId,
}: {
  userId: string; isOwn: boolean; currentUserId: string | null;
}) {
  const tabs: Tab[] = isOwn ? ["Posts", "Shots", "Saved"] : ["Posts", "Shots"];
  const [tab, setTab] = useState<Tab>("Posts");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [shots, setShots] = useState<any[]>([]);
  const [saved, setSaved] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (tab === "Posts") {
        const { data } = await supabase
          .from("posts")
          .select("*, profiles(id, display_name, username, avatar_hue, profile_tags)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30);
        setPosts((data ?? []).map(normPost));
      } else if (tab === "Shots") {
        const { data } = await supabase
          .from("shots")
          .select("id, media_url, caption, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30);
        setShots(data ?? []);
      } else if (tab === "Saved" && isOwn) {
        const { data } = await supabase
          .from("saved_posts")
          .select("posts(*, profiles(id, display_name, username, avatar_hue, profile_tags))")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30);
        const flat = (data ?? [])
          .map((r: any) => r.posts)
          .filter(Boolean)
          .map((p: any) => ({ ...normPost(p), initialSaved: true }));
        setSaved(flat);
      }
      setLoading(false);
    }
    load();
  }, [tab, userId, isOwn, supabase]);

  const activePosts = tab === "Posts" ? posts : tab === "Saved" ? saved : [];

  return (
    <div className="mt-2">
      {/* Tab bar */}
      <div className="sticky top-14 z-10 flex border-y border-border bg-background/90 backdrop-blur-xl">
        {tabs.map((t) => {
          const Icon = t === "Posts" ? Grid3x3 : t === "Shots" ? Zap : Bookmark;
          return (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-sm font-semibold transition-colors ${
                tab === t ? "border-accent text-foreground" : "border-transparent text-muted"
              }`}>
              <Icon size={16} /> {t}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-faint">Loading…</div>
      ) : tab === "Posts" || (tab === "Saved" && isOwn) ? (
        activePosts.length === 0 ? (
          <EmptyState
            icon={PlusCircle}
            title={tab === "Saved" ? "No saved posts yet" : "No posts yet"}
            text={tab === "Saved" ? "Save posts you want to revisit." : "Posts will show up here."}
            ctaLabel={isOwn && tab === "Posts" ? "Create Post" : undefined}
            ctaHref={isOwn && tab === "Posts" ? "/create/post" : undefined}
          />
        ) : (
          <>
            {/* 3-column thumbnail grid */}
            <div className="grid grid-cols-3 gap-1.5 px-1.5">
              {activePosts.map((p, i) => {
                const thumb = getThumb(p);
                const multi = ((p as any).image_urls?.length ?? 0) > 1;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setViewerIdx(i)}
                    className="relative aspect-square overflow-hidden rounded-xl bg-surface"
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-faint">No image</div>
                    )}
                    {/* Multi-image badge */}
                    {multi && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-white">
                        +
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Post viewer modal */}
            {viewerIdx !== null && (
              <PostViewerModal
                posts={activePosts}
                startIdx={viewerIdx}
                currentUserId={currentUserId ?? ""}
                onClose={() => setViewerIdx(null)}
              />
            )}
          </>
        )
      ) : tab === "Shots" ? (
        shots.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No Shots yet"
            text="Short video reels will show here."
            ctaLabel={isOwn ? "Add Shot" : undefined}
            ctaHref={isOwn ? "/create/shot" : undefined}
          />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 px-1.5">
            {shots.map((s) => (
              <Link key={s.id} href={`/shots/${s.id}`} className="relative block aspect-[3/4] overflow-hidden rounded-xl bg-surface">
                <video src={s.media_url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
              </Link>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
