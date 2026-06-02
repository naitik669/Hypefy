"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Star, MessageCircle, Send, Bookmark, MoreHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { RichPostText } from "@/components/ui/RichPostText";
import { CommentsSheet } from "@/components/feed/CommentsSheet";
import { formatCount } from "@/lib/mock";
import { HypeParticles } from "@/components/feed/HypeParticles";

export type FeedPost = {
  id: string;
  user_id: string;
  caption: string | null;
  body: string | null;
  image_url: string | null;
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

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

export function FeedCard({
  post,
  currentUserId,
}: {
  post: FeedPost;
  currentUserId: string;
}) {
  const supabase = createClient();

  // ── Hype state ─────────────────────────────────────────────
  const [hyped, setHyped] = useState(post.initialHyped ?? false);
  const [hypeCount, setHypeCount] = useState(post.hype_count);
  const [hypePending, setHypePending] = useState(false); // guard against race conditions
  const [hypeBurst, setHypeBurst] = useState(false);
  const [showParticles, setShowParticles] = useState(false);

  // ── Save state ─────────────────────────────────────────────
  const [saved, setSaved] = useState(post.initialSaved ?? false);
  const [savePending, setSavePending] = useState(false);

  // ── UI state ───────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);

  // ── Double-tap detection ───────────────────────────────────
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

  // ── Hype toggle — guarded, single-flight ──────────────────
  async function toggleHype() {
    if (hypePending) return; // block until current request completes
    if (!currentUserId) { showToast("Sign in to hype"); return; }

    const prev = hyped;
    const prevCount = hypeCount;

    // Optimistic update
    setHypePending(true);
    setHyped(!prev);
    setHypeCount((c) => c + (prev ? -1 : 1));

    if (!prev) {
      setHypeBurst(true);
      setShowParticles(true);
      setTimeout(() => setHypeBurst(false), 380);
      setTimeout(() => setShowParticles(false), 640);
    }

    try {
      const { data, error } = await supabase.rpc("toggle_hype", {
        p_target_type: "post",
        p_target_id: post.id,
        p_owner_id: post.user_id,
      });

      if (error) throw error;

      // Sync with server truth
      if (data && typeof data === "object") {
        setHyped(Boolean(data.hyped));
        setHypeCount(Number(data.hype_count));
      }
    } catch (err) {
      // Revert on error
      setHyped(prev);
      setHypeCount(prevCount);
      showToast("Couldn't hype. Try again.");
    } finally {
      setHypePending(false);
    }
  }

  // ── Double-tap on image to Hype ────────────────────────────
  function handleImageTap(e: React.MouseEvent) {
    const now = Date.now();
    const diff = now - lastTapRef.current;
    lastTapRef.current = now;

    if (diff < 300) {
      e.preventDefault(); // stop Link navigation
      toggleHype();
    }
    // single tap: Link navigates to /p/[id]
  }

  // ── Save toggle — guarded ──────────────────────────────────
  async function toggleSave() {
    if (savePending) return;
    if (!currentUserId) { showToast("Sign in to save"); return; }

    const prev = saved;
    setSavePending(true);
    setSaved(!prev);

    if (!prev) {
      const { error } = await supabase
        .from("saved_posts")
        .insert({ user_id: currentUserId, post_id: post.id });
      if (error) {
        setSaved(prev);
        if (!/duplicate|unique/i.test(error.message)) showToast("Couldn't save");
      } else {
        showToast("Saved ✓");
      }
    } else {
      const { error } = await supabase
        .from("saved_posts")
        .delete()
        .eq("user_id", currentUserId)
        .eq("post_id", post.id);
      if (error) {
        setSaved(prev);
        showToast("Couldn't unsave");
      } else {
        showToast("Removed");
      }
    }
    setSavePending(false);
  }

  // ── Share ──────────────────────────────────────────────────
  async function share() {
    const url = `${window.location.origin}/p/${post.id}`;
    try {
      if (navigator.share) { await navigator.share({ title: "Hypefy post", url }); return; }
    } catch {}
    await navigator.clipboard.writeText(url).catch(() => {});
    showToast("Link copied");
  }

  return (
    <article className="border-b border-border/50 pb-3">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href={profileHref}>
          <Avatar name={name} hue={hue} size={40} />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Link href={profileHref} className="truncate text-sm font-semibold hover:underline">
            {name}
          </Link>
          <span className="ml-1 text-xs text-faint">· {timeAgo(post.created_at)}</span>
        </div>
        <button type="button" aria-label="More" className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-white/5">
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* Image — single tap navigates, double tap Hypes */}
      {post.image_url && (
        <Link
          href={`/p/${post.id}`}
          className="relative mx-4 block overflow-hidden rounded-2xl"
          onClick={handleImageTap}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.image_url} alt={post.caption ?? "Post"} className="w-full object-cover" />

          {/* Double-tap Hype burst */}
          {hypeBurst && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Star
                size={88}
                className="animate-hype-pop text-hype drop-shadow-[0_4px_20px_rgba(255,208,0,0.5)]"
                fill="currentColor"
              />
            </div>
          )}
          {showParticles && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <HypeParticles size={16} />
            </div>
          )}
        </Link>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-5">
          {/* Hype button */}
          <button
            type="button"
            onClick={toggleHype}
            disabled={hypePending}
            aria-pressed={hyped}
            aria-label="Hype"
            className="flex items-center gap-1.5 text-sm font-semibold tabular-nums disabled:opacity-70"
          >
            <span className="relative">
              <Star
                size={23}
                strokeWidth={2.2}
                className={`${hypeBurst ? "animate-hype-burst" : ""} transition-colors ${hyped ? "text-hype" : "text-foreground"}`}
                fill={hyped ? "currentColor" : "none"}
              />
              {showParticles && <HypeParticles size={9} />}
            </span>
            <span className={hyped ? "text-hype" : "text-foreground"}>{formatCount(hypeCount)}</span>
          </button>

          {/* Comments */}
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            aria-label="Comments"
            className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
          >
            <MessageCircle size={22} strokeWidth={2.2} />
            {formatCount(post.comment_count)}
          </button>

          {/* Share */}
          <button type="button" onClick={share} aria-label="Share" className="text-foreground">
            <Send size={21} strokeWidth={2.2} />
          </button>
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={toggleSave}
          disabled={savePending}
          aria-label="Save"
          className="text-foreground disabled:opacity-70"
        >
          <Bookmark
            size={21}
            strokeWidth={2.2}
            className={saved ? "text-accent" : ""}
            fill={saved ? "currentColor" : "none"}
          />
        </button>
      </div>

      {/* Caption + body */}
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
          {post.body && (
            <p className="mt-1 text-foreground/85">
              <RichPostText text={post.body} />
            </p>
          )}
        </div>
      )}

      {/* Comments sheet */}
      <CommentsSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={post.id}
        postOwnerId={post.user_id}
        currentUserId={currentUserId}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-[88px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-pill bg-elevated px-4 py-2 text-sm font-semibold shadow-lg ring-1 ring-border">
          {toast}
        </div>
      )}
    </article>
  );
}
