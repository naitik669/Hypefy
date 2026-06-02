"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Star, MessageCircle, Send, Bookmark, MoreHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { RichPostText } from "@/components/ui/RichPostText";
import { CommentsSheet } from "@/components/feed/CommentsSheet";
import { PostActionsSheet } from "@/components/feed/PostActionsSheet";
import { ShareSheet } from "@/components/feed/ShareSheet";
import { HypeParticles } from "@/components/feed/HypeParticles";
import { formatCount } from "@/lib/mock";

export type FeedPost = {
  id: string;
  user_id: string;
  caption: string | null;
  body: string | null;
  image_url: string | null;
  image_urls?: string[];
  hashtags: string[];
  mentions: string[];
  hype_count: number;
  comment_count: number;
  created_at: string;
  profiles: {
    id: string | null;
    display_name: string | null;
    username: string | null;
    avatar_hue: number | null;
    profile_tags: string[] | null;
  } | null;
  initialHyped?: boolean;
  initialSaved?: boolean;
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Deduplicate and merge single/multi image fields */
function getImages(post: FeedPost): string[] {
  const urls = post.image_urls?.length ? post.image_urls : post.image_url ? [post.image_url] : [];
  return [...new Set(urls)];
}

export function FeedCard({ post, currentUserId }: { post: FeedPost; currentUserId: string }) {
  const supabase = createClient();
  const images = getImages(post);

  const [hyped, setHyped] = useState(post.initialHyped ?? false);
  const [hypeCount, setHypeCount] = useState(post.hype_count);
  const [hypePending, setHypePending] = useState(false);
  const [hypeBurst, setHypeBurst] = useState(false);
  const [showParticles, setShowParticles] = useState(false);

  const [saved, setSaved] = useState(post.initialSaved ?? false);
  const [savePending, setSavePending] = useState(false);

  const [imgIdx, setImgIdx] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const lastTapRef = useRef(0);

  const profile = post.profiles;
  const name = profile?.display_name ?? profile?.username ?? "User";
  const username = profile?.username;
  const hue = profile?.avatar_hue ?? 280;
  const profileHref = username ? `/u/${username}` : "#";

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1500);
  }

  async function toggleHype() {
    if (hypePending) return;
    if (!currentUserId) { showToast("Sign in to hype"); return; }
    const prev = hyped, prevCount = hypeCount;
    setHypePending(true);
    setHyped(!prev);
    setHypeCount((c) => c + (prev ? -1 : 1));
    if (!prev) {
      setHypeBurst(true); setShowParticles(true);
      setTimeout(() => setHypeBurst(false), 380);
      setTimeout(() => setShowParticles(false), 640);
    }
    try {
      const { data, error } = await supabase.rpc("toggle_hype", {
        p_target_type: "post", p_target_id: post.id, p_owner_id: post.user_id,
      });
      if (error) throw error;
      if (data && typeof data === "object") {
        setHyped(Boolean(data.hyped));
        setHypeCount(Number(data.hype_count));
      }
    } catch {
      setHyped(prev); setHypeCount(prevCount);
      showToast("Couldn't hype. Try again.");
    } finally {
      setHypePending(false);
    }
  }

  function handleImageTap(e: React.MouseEvent) {
    const now = Date.now();
    if (now - lastTapRef.current < 300) { e.preventDefault(); toggleHype(); }
    lastTapRef.current = now;
  }

  async function toggleSave() {
    if (savePending) return;
    if (!currentUserId) { showToast("Sign in to save"); return; }
    const prev = saved;
    setSavePending(true); setSaved(!prev);
    if (!prev) {
      const { error } = await supabase.from("saved_posts").insert({ user_id: currentUserId, post_id: post.id });
      if (error) { setSaved(prev); if (!/duplicate|unique/i.test(error.message)) showToast("Couldn't save"); }
      else showToast("Saved ✓");
    } else {
      const { error } = await supabase.from("saved_posts").delete().eq("user_id", currentUserId).eq("post_id", post.id);
      if (error) { setSaved(prev); showToast("Couldn't unsave"); }
      else showToast("Removed");
    }
    setSavePending(false);
  }

  async function share() {
    const url = `${window.location.origin}/p/${post.id}`;
    try { if (navigator.share) { await navigator.share({ title: "Hypefy post", url }); return; } } catch {}
    await navigator.clipboard.writeText(url).catch(() => {});
    showToast("Link copied");
  }

  if (deleted) return null;

  return (
    <article className="relative border-b border-border/50 pb-3">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href={profileHref}><Avatar name={name} hue={hue} size={40} /></Link>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Link href={profileHref} className="truncate text-sm font-semibold hover:underline">{name}</Link>
          <span className="ml-1 text-xs text-faint">· {timeAgo(post.created_at)}</span>
        </div>
        {/* THREE DOTS — fully functional */}
        <button type="button" aria-label="More" onClick={() => setActionsOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-white/5">
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* Image carousel */}
      {images.length > 0 && (
        <div className="relative mx-4 overflow-hidden rounded-2xl">
          <Link href={`/p/${post.id}`} onClick={handleImageTap} className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[imgIdx]} alt={post.caption ?? "Post"} className="w-full object-cover" />

            {/* Double-tap burst */}
            {hypeBurst && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Star size={88} className="animate-hype-pop text-hype drop-shadow-[0_4px_20px_rgba(255,208,0,0.5)]" fill="currentColor" />
              </div>
            )}
            {showParticles && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <HypeParticles size={16} />
              </div>
            )}
          </Link>

          {/* Multi-image dots + counter */}
          {images.length > 1 && (
            <>
              <span className="absolute right-2.5 top-2.5 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                {imgIdx + 1}/{images.length}
              </span>
              <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
                {images.map((_, i) => (
                  <button key={i} type="button" onClick={() => setImgIdx(i)}
                    className={`h-1.5 rounded-full transition-all ${i === imgIdx ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-5">
          <button type="button" onClick={toggleHype} disabled={hypePending}
            aria-pressed={hyped} aria-label="Hype"
            className="flex items-center gap-1.5 text-sm font-semibold tabular-nums disabled:opacity-70">
            <span className="relative">
              <Star size={23} strokeWidth={2.2}
                className={`${hypeBurst ? "animate-hype-burst" : ""} transition-colors ${hyped ? "text-hype" : "text-foreground"}`}
                fill={hyped ? "currentColor" : "none"} />
              {showParticles && <HypeParticles size={9} />}
            </span>
            <span className={hyped ? "text-hype" : "text-foreground"}>{formatCount(hypeCount)}</span>
          </button>

          <button type="button" onClick={() => setCommentsOpen(true)} aria-label="Comments"
            className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <MessageCircle size={22} strokeWidth={2.2} />
            {formatCount(post.comment_count)}
          </button>

          <button type="button" onClick={() => setShareOpen(true)} aria-label="Share" className="text-foreground">
            <Send size={21} strokeWidth={2.2} />
          </button>
        </div>

        <button type="button" onClick={toggleSave} disabled={savePending} aria-label="Save"
          className="text-foreground disabled:opacity-70">
          <Bookmark size={21} strokeWidth={2.2} className={saved ? "text-accent" : ""} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      {/* Caption */}
      {(post.caption || post.body) && (
        <div className="px-4 pt-2 text-sm leading-snug">
          {post.caption && (
            <p>
              <Link href={profileHref} className="font-semibold hover:underline">
                {username ? `@${username}` : name}
              </Link>{" "}
              <RichPostText text={post.caption} />
            </p>
          )}
          {post.body && <p className="mt-1 text-foreground/85"><RichPostText text={post.body} /></p>}
        </div>
      )}

      {/* Sheets */}
      <CommentsSheet open={commentsOpen} onClose={() => setCommentsOpen(false)}
        postId={post.id} postOwnerId={post.user_id} currentUserId={currentUserId} />

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} postId={post.id} />

      <PostActionsSheet open={actionsOpen} onClose={() => setActionsOpen(false)}
        postId={post.id} postUserId={post.user_id} postUsername={username ?? null}
        currentUserId={currentUserId} onDelete={() => setDeleted(true)} />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-[88px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-pill bg-elevated px-4 py-2 text-sm font-semibold shadow-lg ring-1 ring-border">
          {toast}
        </div>
      )}
    </article>
  );
}
