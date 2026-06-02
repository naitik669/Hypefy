"use client";

import { useState } from "react";
import { Star, MessageCircle, Send, Bookmark, MoreHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { RichPostText } from "@/components/ui/RichPostText";
import { formatCount } from "@/lib/mock";

type PostProfile = {
  id: string | null;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  profile_tags: string[] | null;
} | null;

type Post = {
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
  profiles: PostProfile;
};

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

export function FeedCard({ post, currentUserId }: { post: Post; currentUserId: string }) {
  const supabase = createClient();
  const [hyped, setHyped] = useState(false);
  const [hypeCount, setHypeCount] = useState(post.hype_count);
  const [saved, setSaved] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [hypeBurst, setHypeBurst] = useState(false);

  const profile = post.profiles;
  const name = profile?.display_name ?? profile?.username ?? "User";
  const handle = profile?.username ? `@${profile.username}` : null;
  const hue = profile?.avatar_hue ?? 280;

  async function toggleHype() {
    const next = !hyped;
    setHyped(next);
    setHypeCount((c) => c + (next ? 1 : -1));
    if (next) { setHypeBurst(true); setTimeout(() => setHypeBurst(false), 360); }
    // Update hype_count in DB
    await supabase
      .from("posts")
      .update({ hype_count: next ? hypeCount + 1 : hypeCount - 1 })
      .eq("id", post.id);
  }

  function toggleSave() {
    setSaved((s) => {
      const next = !s;
      setSaveToast(next ? "Saved ✓" : "Removed");
      if (next) {
        supabase.from("saved_posts").insert({ user_id: currentUserId, post_id: post.id }).then(() => {});
      } else {
        supabase.from("saved_posts").delete().eq("user_id", currentUserId).eq("post_id", post.id).then(() => {});
      }
      return next;
    });
    setTimeout(() => setSaveToast(null), 1500);
  }

  return (
    <article className="border-b border-border/50 pb-3">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar name={name} hue={hue} size={40} />
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="truncate text-sm font-semibold">{name}</span>
          <span className="ml-1 text-xs text-faint">· {timeAgo(post.created_at)}</span>
        </div>
        <button type="button" aria-label="More" className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-white/5">
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* Image (if present) */}
      {post.image_url && (
        <div className="mx-4 overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.image_url} alt={post.caption ?? "Post"} className="w-full object-cover" />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-5">
          {/* Hype */}
          <button type="button" onClick={toggleHype} aria-pressed={hyped} aria-label="Hype" className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
            <Star size={23} strokeWidth={2.2} className={`${hypeBurst ? "animate-hype-burst" : ""} transition-colors ${hyped ? "text-hype" : "text-foreground"}`} fill={hyped ? "currentColor" : "none"} />
            <span className={hyped ? "text-hype" : "text-foreground"}>{formatCount(hypeCount)}</span>
          </button>
          {/* Comments */}
          <button type="button" aria-label="Comments" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <MessageCircle size={22} strokeWidth={2.2} />
            {formatCount(post.comment_count)}
          </button>
          {/* Share */}
          <button type="button" aria-label="Share" onClick={async () => { await navigator.clipboard.writeText(`${window.location.origin}/p/${post.id}`).catch(() => {}); }} className="text-foreground">
            <Send size={21} strokeWidth={2.2} />
          </button>
        </div>
        <button type="button" aria-label="Save" onClick={toggleSave} className="text-foreground">
          <Bookmark size={21} strokeWidth={2.2} className={saved ? "text-accent" : ""} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      {/* Caption + body */}
      {(post.caption || post.body) && (
        <div className="px-4 pt-2 text-sm leading-snug">
          {post.caption && (
            <p>
              <span className="font-semibold">{handle ?? name}</span>{" "}
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

      {/* Save toast */}
      {saveToast && (
        <div className="fixed bottom-[88px] left-1/2 z-40 -translate-x-1/2 rounded-pill bg-elevated px-4 py-2 text-sm font-semibold shadow-lg ring-1 ring-border">
          {saveToast}
        </div>
      )}
    </article>
  );
}
