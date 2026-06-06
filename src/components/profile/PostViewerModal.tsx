"use client";

import { useEffect, useRef, useState } from "react";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import { FeedCard, type FeedPost } from "@/components/feed/FeedCard";

/**
 * Full-screen post viewer opened from the profile grid.
 * JS-controlled one-post-at-a-time navigation — swipe up/down moves
 * exactly one post regardless of velocity. Native scroll cannot skip.
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
  const [activeIdx, setActiveIdx] = useState(startIdx);
  const touchStartY = useRef(0);
  // Track whether the inner slide was scrolled (to avoid conflict with navigation swipe)
  const innerScrolledRef = useRef(false);

  // Close on Escape + lock background scroll
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") setActiveIdx((i) => Math.min(i + 1, posts.length - 1));
      if (e.key === "ArrowUp") setActiveIdx((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, posts.length]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
    innerScrolledRef.current = false;
  }

  function onTouchEnd(e: React.TouchEvent) {
    // If the inner post content was scrolled, don't navigate
    if (innerScrolledRef.current) return;
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(dy) < 50) return; // too small — not a navigation swipe
    setActiveIdx((i) =>
      dy > 0 ? Math.min(i + 1, posts.length - 1) : Math.max(i - 1, 0),
    );
  }

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
        <span className="flex-1 px-1 text-sm font-bold">
          {activeIdx + 1} / {posts.length}
        </span>
        {/* Nav arrows — visible on desktop */}
        <button
          type="button"
          onClick={() => setActiveIdx((i) => Math.max(i - 1, 0))}
          disabled={activeIdx === 0}
          aria-label="Previous post"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-white/5 disabled:opacity-30"
        >
          <ChevronUp size={20} />
        </button>
        <button
          type="button"
          onClick={() => setActiveIdx((i) => Math.min(i + 1, posts.length - 1))}
          disabled={activeIdx === posts.length - 1}
          aria-label="Next post"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-white/5 disabled:opacity-30"
        >
          <ChevronDown size={20} />
        </button>
      </div>

      {/* Controlled viewer — one post at a time */}
      <div
        className="relative flex-1 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {posts.map((p, i) => (
          <div
            key={p.id}
            className={`absolute inset-0 overflow-y-auto transition-transform duration-300 ease-out will-change-transform ${
              i === activeIdx ? "" : "pointer-events-none"
            }`}
            style={{ transform: `translateY(calc(${i - activeIdx} * 100%))` }}
            // Mark if user scrolled inside this slide so we skip swipe navigation
            onScroll={() => { innerScrolledRef.current = true; }}
          >
            <div className="mx-auto w-full max-w-[480px]">
              <FeedCard post={p} currentUserId={currentUserId} />
            </div>
          </div>
        ))}
      </div>

      {/* Swipe hint dots */}
      {posts.length > 1 && (
        <div className="pointer-events-none absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1">
          {posts.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-200 ${
                i === activeIdx ? "w-4 bg-foreground" : "w-1 bg-foreground/20"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
