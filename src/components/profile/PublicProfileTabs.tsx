"use client";

import { useEffect, useState } from "react";
import { Grid3x3, Zap, Bookmark, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { type FeedPost } from "@/components/feed/FeedCard";
import { EmptyScene, ctaClass } from "@/components/empty/EmptyScene";
import {
  CanvasArt,
  ClapperArt,
  ConeArt,
  CurtainsArt,
  FrameArt,
  LockerArt,
} from "@/components/empty/scenes";
import { FollowButton } from "@/components/profile/FollowButton";
import { GRID, GRID_WRAP } from "@/components/profile/postGrid";
import { BLANK_POSTER } from "@/lib/blank-poster";

type Tab = "Posts" | "Shots" | "Saved";

/** Someone else's empty profile gets one of three scenes, always the same one
 *  for the same person, so it reads as theirs rather than random. */
const OTHER_EMPTY = [
  { art: <CanvasArt />, title: "Blank canvas" },
  { art: <CurtainsArt />, title: "Curtains closed" },
  { art: <ConeArt />, title: "Still setting up" },
];

function sceneFor(userId: string) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return OTHER_EMPTY[Math.abs(h) % OTHER_EMPTY.length];
}

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
  userId,
  isOwn,
  currentUserId,
  name = "They",
  initialFollowing = false,
  initialRequested = false,
}: {
  userId: string;
  isOwn: boolean;
  currentUserId: string | null;
  name?: string;
  initialFollowing?: boolean;
  initialRequested?: boolean;
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
          .select(
            "*, profiles!posts_user_id_fkey(id, display_name, username, avatar_hue, avatar_url, profile_tags, is_verified, is_premium, name_font, name_glow, avatar_decoration)"
          )
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
          .select(
            "posts(*, profiles!posts_user_id_fkey(id, display_name, username, avatar_hue, avatar_url, profile_tags, is_verified, is_premium, name_font, name_glow, avatar_decoration))"
          )
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
      {/* Tab bar — thin hairline dividers, blends with the page background */}
      <div className="sticky top-14 z-10 flex border-y border-border chrome-bar">
        {tabs.map((t) => {
          const Icon = t === "Posts" ? Grid3x3 : t === "Shots" ? Zap : Bookmark;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-sm font-semibold transition-colors ${
                tab === t
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted"
              }`}
            >
              <Icon size={16} /> {t}
            </button>
          );
        })}
      </div>

      <div key={tab} className="animate-fade-swap mt-3">
        {loading ? (
          // Mirrors the real grid so the layout does
          // not visibly reflow when the posts land.
          <div className={GRID_WRAP}>
            <div className={GRID}>
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  style={i === 1 || i === 5 ? { gridRow: "span 2" } : undefined}
                  className="skeleton h-full rounded-xl"
                />
              ))}
            </div>
          </div>
        ) : tab === "Posts" || (tab === "Saved" && isOwn) ? (
          activePosts.length === 0 ? (
            tab === "Saved" ? (
              <EmptyScene
                art={<LockerArt />}
                title="Locker's empty"
                text="Tap the bookmark on any post to stash it."
                timing={{ head: 1.1, sub: 1.45, cta: 1.8 }}
                cta={
                  <Link href="/discover" className={ctaClass}>
                    Find something to save
                  </Link>
                }
              />
            ) : isOwn ? (
              <EmptyScene
                art={<FrameArt />}
                title="Blank wall"
                text="Hang your first post."
                cta={
                  <Link href="/create/post" className={ctaClass}>
                    Create a post
                  </Link>
                }
              />
            ) : (
              <EmptyScene
                art={sceneFor(userId).art}
                title={sceneFor(userId).title}
                text={`${name} hasn't posted yet.`}
                // Following is the one useful thing to do here; once you
                // already do, there's nothing to ask.
                cta={
                  currentUserId && !initialFollowing ? (
                    <FollowButton
                      targetUserId={userId}
                      initialFollowing={initialFollowing}
                      initialRequested={initialRequested}
                      variant="cta"
                      followLabel={`Follow ${name}`}
                    />
                  ) : undefined
                }
              />
            )
          ) : (
            <>
              {/* Three columns, but portrait posts take two rows — see
                postGrid.ts for why the wrapper exists. */}
              <div className={GRID_WRAP}>
                <div className={GRID}>
                  {activePosts.map((p) => {
                    const thumb = getThumb(p);
                    const multi = ((p as any).image_urls?.length ?? 0) > 1;
                    return (
                      // Was a button opening PostViewerModal — a second feed
                      // screen with its own chrome, doing the job /p/[postId]
                      // already does, with no URL and nothing to come back to.
                      <Link
                        key={p.id}
                        href={`/p/${p.id}`}
                        className="relative h-full overflow-hidden rounded-xl bg-surface"
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-faint">
                            No image
                          </div>
                        )}
                        {/* Multi-image badge — signals a swipeable gallery post */}
                        {multi && (
                          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white drop-shadow">
                            <Copy size={11} strokeWidth={2.5} />
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </>
          )
        ) : tab === "Shots" ? (
          shots.length === 0 ? (
            <EmptyScene
              art={<ClapperArt />}
              title="No Shots fired"
              text={isOwn ? "Lights, camera, you." : `${name} hasn't posted a Shot yet.`}
              timing={{ head: 1.2, sub: 1.55, cta: 1.9 }}
              cta={
                isOwn ? (
                  <Link href="/create/shot" className={ctaClass}>
                    Record a Shot
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-3 gap-1.5 px-1.5">
              {shots.map((s) => (
                <Link
                  key={s.id}
                  href={`/shots/${s.id}`}
                  className="relative block aspect-[3/4] overflow-hidden rounded-xl bg-surface"
                >
                  <video poster={BLANK_POSTER}
                    src={s.media_url}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                </Link>
              ))}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
