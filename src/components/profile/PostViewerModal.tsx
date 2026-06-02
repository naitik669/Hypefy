"use client";

import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { FeedCard, type FeedPost } from "@/components/feed/FeedCard";

/**
 * Full-screen post viewer opened from a profile grid.
 * Shows posts one at a time with left/right navigation (like Instagram).
 */
export function PostViewerModal({
  posts,
  startIdx,
  currentUserId,
  onClose,
}: {
  posts: FeedPost[];
  startIdx: number;
  currentUserId: string;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIdx);
  const post = posts[idx];

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!post) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex h-12 items-center justify-between border-b border-border/60 bg-background/90 px-3 backdrop-blur-xl">
        <button type="button" onClick={onClose} aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-white/5">
          <X size={22} />
        </button>
        <span className="text-sm font-semibold text-muted">
          {idx + 1} / {posts.length}
        </span>
        <div className="flex gap-1">
          <button type="button" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-white/5 disabled:opacity-30">
            <ChevronLeft size={22} />
          </button>
          <button type="button" disabled={idx === posts.length - 1} onClick={() => setIdx((i) => i + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-white/5 disabled:opacity-30">
            <ChevronRight size={22} />
          </button>
        </div>
      </div>

      {/* Post */}
      <div className="mx-auto w-full max-w-[480px] flex-1 overflow-y-auto">
        <FeedCard key={post.id} post={post} currentUserId={currentUserId} />
      </div>
    </div>
  );
}
