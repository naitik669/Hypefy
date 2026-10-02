"use client";

import { useRef, useState } from "react";
import { haptics } from "@/lib/haptics";
import type { PeekAuthor } from "@/components/feed/PostPeek";
import { PeekFor } from "@/components/feed/PeekFor";
import type { RehypeKind } from "@/lib/rehype";

/** Matches FeedCard, so the gesture feels the same wherever a post is. */
const HOLD_MS = 350;
const HOLD_SLOP_PX = 10;

export type PeekablePost = {
  id: string;
  user_id: string;
  caption: string | null;
  image: string | null;
  /**
   * A Shot's video. With one the peek PLAYS rather than holding a still, and
   * `image` is the poster it starts from — which a Shot may not have, so the
   * hold is allowed on the video alone.
   */
  video?: string | null;
  /** The post's composed shape, so the peek opens at the right size. */
  aspect_ratio: number | null;
  hype_count: number;
  comment_count: number;
  /** Carried by callers; the peek no longer draws who posted. */
  author: PeekAuthor | null;
};

/**
 * Hold a tile in a grid to lift the post or Shot out of it.
 *
 * A grid trades context for density: twelve things on screen and no idea
 * what any of them is up close. Holding one opens the peek (PeekFor), which
 * reads whether you have hyped or saved it as it opens rather than for every
 * tile up front — a grid of twelve would otherwise be twelve queries for
 * something nobody may hold.
 */
export function GridPeek({
  post,
  kind = "post",
  currentUserId,
  className = "",
  children,
}: {
  post: PeekablePost;
  /** Which of the two things this tile is: their actions live in different tables. */
  kind?: RehypeKind;
  currentUserId?: string;
  /**
   * Applied to the wrapper, which IS the layout item. Discover's masonry
   * spaces its direct children, so this cannot be display:contents.
   */
  className?: string;
  /** The tile itself — usually a Link. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });
  /** A hold happened, so the click that follows it is not a tap. */
  const held = useRef(false);
  const liftable = !!(post.image || post.video);

  function clear() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  return (
    <>
      <div
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          held.current = false;
          start.current = { x: e.clientX, y: e.clientY };
          clear();
          timer.current = setTimeout(() => {
            // A Shot may have no poster; it is still worth holding.
            if (!liftable) return;
            held.current = true;
            haptics.select();
            setOpen(true);
          }, HOLD_MS);
        }}
        onPointerMove={(e) => {
          // Moving means scrolling. A grid is something people flick through,
          // so this has to give up early or every scroll lifts a post.
          if (
            Math.abs(e.clientX - start.current.x) > HOLD_SLOP_PX ||
            Math.abs(e.clientY - start.current.y) > HOLD_SLOP_PX
          )
            clear();
        }}
        onPointerUp={clear}
        onPointerCancel={clear}
        onContextMenu={(e) => {
          // The WebView's own long-press menu would otherwise appear on top of the peek.
          if (liftable) e.preventDefault();
        }}
        onClickCapture={(e) => {
          // The hold ends in a click. Swallow it, or letting go navigates to
          // the post you were only looking at.
          if (held.current) {
            e.preventDefault();
            e.stopPropagation();
            held.current = false;
          }
        }}
        style={{ touchAction: "pan-y", WebkitTouchCallout: "none" }}
        className={className}
      >
        {children}
      </div>

      {open && liftable && (
        <PeekFor
          kind={kind}
          currentUserId={currentUserId}
          target={{
            id: post.id,
            image: post.image,
            video: post.video,
            aspect_ratio: post.aspect_ratio,
            caption: post.caption,
            user_id: post.user_id,
            hype_count: post.hype_count,
            comment_count: post.comment_count,
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
