"use client";

import { useEffect, useState } from "react";
import { Grid3x3, Zap, Bookmark, PlusCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { FeedCard, type FeedPost } from "@/components/feed/FeedCard";
import { EmptyState } from "@/components/ui/EmptyState";

type Tab = "Posts" | "Shots" | "Saved";

export function PublicProfileTabs({
  userId,
  isOwn,
  currentUserId,
}: {
  userId: string;
  isOwn: boolean;
  currentUserId: string | null;
}) {
  const tabs: Tab[] = isOwn ? ["Posts", "Shots", "Saved"] : ["Posts", "Shots"];
  const [tab, setTab] = useState<Tab>("Posts");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [shots, setShots] = useState<any[]>([]);
  const [saved, setSaved] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
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
        setPosts(
          (data ?? []).map((p) => ({
            ...p,
            profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
          })) as FeedPost[],
        );
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
          .map((p: any) => ({
            ...p,
            profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
            initialSaved: true,
          })) as FeedPost[];
        setSaved(flat);
      }
      setLoading(false);
    }
    load();
  }, [tab, userId, isOwn, supabase]);

  return (
    <div className="mt-2">
      {/* Tab bar */}
      <div className="sticky top-14 z-10 flex border-y border-border bg-background/90 backdrop-blur-xl">
        {tabs.map((t) => {
          const Icon = t === "Posts" ? Grid3x3 : t === "Shots" ? Zap : Bookmark;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-sm font-semibold transition-colors ${
                tab === t ? "border-accent text-foreground" : "border-transparent text-muted"
              }`}
            >
              <Icon size={16} />
              {t}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-faint">Loading…</div>
      ) : tab === "Posts" ? (
        posts.length === 0 ? (
          <EmptyState
            icon={PlusCircle}
            title="No posts yet"
            text="Posts will show up here."
            ctaLabel={isOwn ? "Create Post" : undefined}
            ctaHref={isOwn ? "/create/post" : undefined}
          />
        ) : (
          <div className="flex flex-col">
            {posts.map((p) => (
              <FeedCard key={p.id} post={p} currentUserId={currentUserId ?? ""} />
            ))}
          </div>
        )
      ) : tab === "Shots" ? (
        shots.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No Shots yet"
            text="24-hour moments will show here."
            ctaLabel={isOwn ? "Add Shot" : undefined}
            ctaHref={isOwn ? "/shows/add" : undefined}
          />
        ) : (
          <div className="grid grid-cols-3 gap-0.5">
            {shots.map((s) => (
              <Link key={s.id} href={`/shows/${s.id}`} className="aspect-[3/4] block overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.media_url} alt={s.caption ?? "Shot"} className="h-full w-full object-cover" />
              </Link>
            ))}
          </div>
        )
      ) : (
        // Saved
        saved.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="No saved posts yet"
            text="Save posts you want to revisit."
          />
        ) : (
          <div className="flex flex-col">
            {saved.map((p) => (
              <FeedCard key={p.id} post={p} currentUserId={currentUserId ?? ""} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
