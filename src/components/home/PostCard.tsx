"use client";

import { useRef, useState } from "react";
import { Star, MessageCircle, Send, Bookmark, MoreHorizontal } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { HypeButton } from "@/components/home/HypeButton";
import { HypeParticles } from "@/components/feed/HypeParticles";
import { CommentsSheet } from "@/components/feed/CommentsSheet";
import { ShareSheet } from "@/components/feed/ShareSheet";
import { formatCount, type Post } from "@/lib/mock";

export function PostCard({ post }: { post: Post }) {
  const [following, setFollowing] = useState(post.following);

  // Hype state lives here so double-tap and the button stay in sync.
  const [hyped, setHyped] = useState(post.hyped);
  const [count, setCount] = useState(post.hypes);
  const [pop, setPop] = useState(false);
  const lastTap = useRef(0);

  // Modals + save toast
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function setHype(next: boolean) {
    if (next === hyped) return;
    setHyped(next);
    setCount((c) => c + (next ? 1 : -1));
  }

  function onMediaClick() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!hyped) setHype(true);
      setPop(true);
    }
    lastTap.current = now;
  }

  function toggleSave() {
    setSaved((s) => {
      const next = !s;
      setToast(next ? "Saved ✓" : "Removed");
      return next;
    });
    window.setTimeout(() => setToast(null), 1500);
  }

  const blowingUp = post.hypes >= 5000;

  return (
    <article className="border-b border-border/50 pb-3">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar name={post.username} hue={post.hue} size={40} />
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="truncate text-sm font-semibold">{post.username}</span>
          {post.verified && <VerifiedStar className="h-3.5 w-3.5 shrink-0 text-verified" />}
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

      {/* Media (double-tap to Hype) */}
      <div
        className="relative mx-4 select-none overflow-hidden rounded-2xl"
        onClick={onMediaClick}
      >
        <div
          className="aspect-[4/5] w-full"
          style={{
            background: `radial-gradient(120% 90% at 20% 10%, hsl(${post.mediaFrom} 80% 55% / 0.95), hsl(${post.mediaTo} 70% 22%))`,
          }}
        />

        {blowingUp && (
          <span className="absolute left-3 top-3 rounded-pill bg-black/45 px-2 py-0.5 text-[11px] font-bold text-accent backdrop-blur-sm">
            Blowing up 🔥
          </span>
        )}

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

        {/* Double-tap burst */}
        {pop && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Star
              size={88}
              className="animate-hype-pop text-hype drop-shadow-[0_4px_20px_rgba(255,208,0,0.5)]"
              fill="currentColor"
              onAnimationEnd={() => setPop(false)}
            />
            <HypeParticles size={16} />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-5">
          <HypeButton hyped={hyped} count={count} onToggle={() => setHype(!hyped)} />
          <button
            type="button"
            aria-label="Comments"
            onClick={() => setCommentsOpen(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
          >
            <MessageCircle size={23} strokeWidth={2.2} />
            {formatCount(post.comments)}
          </button>
          <button
            type="button"
            aria-label="Share"
            onClick={() => setShareOpen(true)}
            className="text-foreground"
          >
            <Send size={22} strokeWidth={2.2} />
          </button>
        </div>
        <button
          type="button"
          aria-label="Save"
          onClick={toggleSave}
          className="text-foreground"
        >
          <Bookmark
            size={22}
            strokeWidth={2.2}
            className={saved ? "text-accent" : ""}
            fill={saved ? "currentColor" : "none"}
          />
        </button>
      </div>

      {/* Caption */}
      <p className="px-4 pt-2 text-sm leading-snug">
        <span className="font-semibold">{post.handle}</span>{" "}
        <span className="text-foreground/90">{post.caption}</span>
      </p>

      {/* Sheets */}
      <CommentsSheet open={commentsOpen} onClose={() => setCommentsOpen(false)} />
      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} />

      {/* Save toast */}
      {toast && (
        <div className="fixed bottom-[88px] left-1/2 z-40 -translate-x-1/2 rounded-pill bg-elevated px-4 py-2 text-sm font-semibold text-foreground shadow-[0_8px_24px_-6px_rgba(0,0,0,0.6)] ring-1 ring-border">
          {toast}
        </div>
      )}
    </article>
  );
}
