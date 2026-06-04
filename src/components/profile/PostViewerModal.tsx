"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { FeedCard, type FeedPost } from "@/components/feed/FeedCard";

/**
 * Full-screen post viewer opened from a profile grid.
 * Renders all posts as a vertical feed and jumps to the tapped one —
 * you scroll between posts (and swipe between images within a post).
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
  const startRef = useRef<HTMLDivElement>(null);

  // Jump to the tapped post on open.
  useEffect(() => {
    startRef.current?.scrollIntoView({ block: "start" });
  }, []);

  // Close on Escape + lock background scroll.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!posts.length) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border/60 bg-background/90 px-3 backdrop-blur-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-white/5"
        >
          <X size={22} />
        </button>
        <span className="px-1 text-sm font-bold">Posts</span>
      </div>

      {/* Vertical feed — scroll between posts */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[480px]">
          {posts.map((p, i) => (
            <div key={p.id} ref={i === startIdx ? startRef : undefined} className="scroll-mt-12">
              <FeedCard post={p} currentUserId={currentUserId} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
