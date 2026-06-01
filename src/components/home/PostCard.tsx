"use client";

import { useState } from "react";
import { MessageCircle, Send, Bookmark, MoreHorizontal } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { HypeButton } from "@/components/home/HypeButton";
import { formatCount, type Post } from "@/lib/mock";

export function PostCard({ post }: { post: Post }) {
  const [following, setFollowing] = useState(post.following);
  const [saved, setSaved] = useState(false);

  return (
    <article className="border-b border-border/50 pb-3">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar name={post.username} hue={post.hue} size={40} />
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="truncate text-sm font-semibold">{post.username}</span>
          {post.verified && <VerifiedStar className="h-3.5 w-3.5 shrink-0 text-hype" />}
          <span className="ml-1 truncate text-xs text-faint">· {post.timeAgo}</span>
        </div>

        {!following && (
          <button
            type="button"
            onClick={() => setFollowing(true)}
            className="rounded-full border border-border px-3.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-white/5"
          >
            Follow
          </button>
        )}
        <button
          type="button"
          aria-label="More"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5"
        >
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* Media */}
      <div className="relative mx-4 overflow-hidden rounded-2xl">
        <div
          className="aspect-[4/5] w-full"
          style={{
            background: `radial-gradient(120% 90% at 20% 10%, hsl(${post.mediaFrom} 80% 55% / 0.95), hsl(${post.mediaTo} 70% 22%))`,
          }}
        />
        {post.mediaCount > 1 && (
          <>
            <span className="absolute right-3 top-3 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
              1/{post.mediaCount}
            </span>
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
              {Array.from({ length: post.mediaCount }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === 0 ? "w-4 bg-white" : "w-1.5 bg-white/50"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-5">
          <HypeButton initialHyped={post.hyped} initialCount={post.hypes} />
          <button
            type="button"
            aria-label="Comments"
            className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
          >
            <MessageCircle size={23} strokeWidth={2.2} />
            {formatCount(post.comments)}
          </button>
          <button
            type="button"
            aria-label="Share"
            className="text-foreground"
          >
            <Send size={22} strokeWidth={2.2} />
          </button>
        </div>
        <button
          type="button"
          aria-label="Save"
          onClick={() => setSaved((s) => !s)}
          className="text-foreground"
        >
          <Bookmark
            size={22}
            strokeWidth={2.2}
            fill={saved ? "currentColor" : "none"}
          />
        </button>
      </div>

      {/* Caption */}
      <p className="px-4 pt-2 text-sm leading-snug">
        <span className="font-semibold">{post.handle}</span>{" "}
        <span className="text-foreground/90">{post.caption}</span>
      </p>
    </article>
  );
}
