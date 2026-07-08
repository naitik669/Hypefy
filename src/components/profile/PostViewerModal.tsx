"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import { FeedCard, type FeedPost } from "@/components/feed/FeedCard";
import { ViewPing } from "@/components/feed/ViewPing";

/**
 * Full-screen post viewer opened from the profile grid (and /p/[postId]).
 * Plain native vertical scroll through the same posts/order as the grid —
 * same feel as the home feed, just starting on the tapped post.
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Jump to the tapped post before paint so there's no scroll-flash.
  useLayoutEffect(() => {
    const el = itemRefs.current[startIdx];
    if (el && scrollRef.current) {
      scrollRef.current.scrollTop = el.offsetTop;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {/* Count a view for the post that was actually tapped open */}
      {posts[startIdx] && <ViewPing postId={posts[startIdx].id} />}
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
        <span className="flex-1 px-1 text-sm font-bold">Post</span>
      </div>

      {/* Native scroll — same as the feed, just anchored to the tapped post */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[480px] flex-col">
          {posts.map((p, i) => (
            <div key={p.id} ref={(el) => { itemRefs.current[i] = el; }}>
              <FeedCard post={p} currentUserId={currentUserId} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
