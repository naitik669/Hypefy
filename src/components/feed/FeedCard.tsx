"use client";

import { useState } from "react";
import Link from "next/link";
import { Star, MessageCircle, Send, Bookmark, MoreHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { RichPostText } from "@/components/ui/RichPostText";
import { CommentsSheet } from "@/components/feed/CommentsSheet";
import { formatCount } from "@/lib/mock";

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

  const [hyped, setHyped] = useState(post.initialHyped ?? false);
  const [hypeCount, setHypeCount] = useState(post.hype_count);
  const [hypeBurst, setHypeBurst] = useState(false);
  const [saved, setSaved] = useState(post.initialSaved ?? false);
  const [toast, setToast] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const profile = post.profiles;
  const name = profile?.display_name ?? profile?.username ?? "User";
  const username = profile?.username;
  const hue = profile?.avatar_hue ?? 280;
  const profileHref = username ? `/u/${username}` : "#";

  async function toggleHype() {
    const prev = hyped;
    const prevCount = hypeCount;
    // Optimistic update
    setHyped(!prev);
    setHypeCount((c) => c + (prev ? -1 : 1));
    if (!prev) { setHypeBurst(true); setTimeout(() => setHypeBurst(false), 360); }

    try {
      const { data, error } = await supabase.rpc("toggle_hype", {
        p_target_type: "post",
        p_target_id: post.id,
        p_owner_id: post.user_id,
      });
      if (error) throw error;
      setHyped(data.hyped);
      setHypeCount(data.hype_count);
    } catch {
      // Revert on error
      setHyped(prev);
      setHypeCount(prevCount);
    }
  }

  async function toggleSave() {
    const prev = saved;
    setSaved(!prev);
    setToast(!prev ? "Saved ✓" : "Removed");
    setTimeout(() => setToast(null), 1500);

    if (!prev) {
      const { error } = await supabase
        .from("saved_posts")
        .insert({ user_id: currentUserId, post_id: post.id });
      if (error && !/duplicate|unique/i.test(error.message)) setSaved(prev);
    } else {
      const { error } = await supabase
        .from("saved_posts")
        .delete()
        .eq("user_id", currentUserId)
        .eq("post_id", post.id);
      if (error) setSaved(prev);
    }
  }

  async function share() {
    const url = `${window.location.origin}/p/${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Hypefy post", url });
        return;
      }
    } catch {}
    await navigator.clipboard.writeText(url).catch(() => {});
    setToast("Link copied");
    setTimeout(() => setToast(null), 1500);
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
        <button
          type="button"
          aria-label="More"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-white/5"
        >
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* Image */}
      {post.image_url && (
        <Link href={`/p/${post.id}`} className="mx-4 block overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image_url}
            alt={post.caption ?? "Post"}
            className="w-full object-cover"
          />
        </Link>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={toggleHype}
            aria-pressed={hyped}
            aria-label="Hype"
            className="flex items-center gap-1.5 text-sm font-semibold tabular-nums"
          >
            <Star
              size={23}
              strokeWidth={2.2}
              className={`${hypeBurst ? "animate-hype-burst" : ""} transition-colors ${hyped ? "text-hype" : "text-foreground"}`}
              fill={hyped ? "currentColor" : "none"}
            />
            <span className={hyped ? "text-hype" : "text-foreground"}>{formatCount(hypeCount)}</span>
          </button>

          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            aria-label="Comments"
            className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
          >
            <MessageCircle size={22} strokeWidth={2.2} />
            {formatCount(post.comment_count)}
          </button>

          <button
            type="button"
            onClick={share}
            aria-label="Share"
            className="text-foreground"
          >
            <Send size={21} strokeWidth={2.2} />
          </button>
        </div>

        <button
          type="button"
          onClick={toggleSave}
          aria-label="Save"
          className="text-foreground"
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
        <div className="fixed bottom-[88px] left-1/2 z-40 -translate-x-1/2 rounded-pill bg-elevated px-4 py-2 text-sm font-semibold shadow-lg ring-1 ring-border">
          {toast}
        </div>
      )}
    </article>
  );
}
