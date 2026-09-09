"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import { hypeResult } from "@/lib/supabase/typed";
import { PostPeek, type PeekAuthor } from "@/components/feed/PostPeek";
import { CommentsSheet } from "@/components/feed/CommentsSheet";
import { ShareSheet } from "@/components/feed/ShareSheet";

/** Matches FeedCard, so the gesture feels the same wherever a post is. */
const HOLD_MS = 350;
const HOLD_SLOP_PX = 10;

export type PeekablePost = {
  id: string;
  user_id: string;
  caption: string | null;
  image: string | null;
  hype_count: number;
  comment_count: number;
  author: PeekAuthor | null;
};

/**
 * Hold a tile in a grid to lift the whole post out of it.
 *
 * A grid trades context for density: you get twelve posts on screen and no
 * idea who made any of them, so answering "what is that?" costs a navigation
 * and a way back. In the feed that is already solved — hold a photo and the
 * card lifts — and there was no reason the same gesture should not work in
 * Discover and in search results.
 *
 * The state the peek needs (have I hyped this, have I saved it) is fetched
 * WHEN THE PEEK OPENS rather than for every tile up front. A grid of twelve
 * would otherwise be twelve queries for something nobody may hold.
 */
export function GridPeek({
  post,
  currentUserId,
  className = "",
  children,
}: {
  post: PeekablePost;
  currentUserId?: string;
  /**
   * Applied to the wrapper, which IS the layout item.
   *
   * This started as `display: contents` so the tile stayed the grid item
   * directly — and that silently broke Discover. Its masonry spaces items
   * with `[&>*]:mb-2`, a rule about DIRECT CHILDREN, and a display:contents
   * element generates no box for a margin to apply to. The gaps went to zero
   * and nothing errored. A real element, styled by the caller, cannot fail
   * that way.
   */
  className?: string;
  /** The tile itself — usually a Link. */
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [hyped, setHyped] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hypeCount, setHypeCount] = useState(post.hype_count);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [pending, setPending] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });
  /** A hold happened, so the click that follows it is not a tap. */
  const held = useRef(false);

  function clear() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  async function openPeek() {
    if (!post.image) return; // nothing to lift
    held.current = true;
    haptics.select();
    setOpen(true);

    if (!currentUserId) return;
    const [h, s] = await Promise.all([
      supabase
        .from("hypes")
        .select("target_id")
        .eq("user_id", currentUserId)
        .eq("target_type", "post")
        .eq("target_id", post.id)
        .maybeSingle(),
      supabase
        .from("saved_posts")
        .select("post_id")
        .eq("user_id", currentUserId)
        .eq("post_id", post.id)
        .maybeSingle(),
    ]);
    setHyped(!!h.data);
    setSaved(!!s.data);
  }

  async function toggleHype() {
    if (pending || !currentUserId) return;
    const prev = hyped;
    const prevCount = hypeCount;
    setPending(true);
    setHyped(!prev);
    setHypeCount((c) => c + (prev ? -1 : 1));
    haptics[prev ? "tap" : "success"]();
    try {
      const { data, error } = await supabase.rpc("toggle_hype", {
        p_target_type: "post",
        p_target_id: post.id,
        p_owner_id: post.user_id,
      });
      if (error) throw error;
      const res = hypeResult(data);
      if (res) {
        setHyped(res.hyped);
        setHypeCount(res.hype_count);
      }
    } catch {
      setHyped(prev);
      setHypeCount(prevCount);
    } finally {
      setPending(false);
    }
  }

  async function toggleSave() {
    if (!currentUserId) return;
    const prev = saved;
    setSaved(!prev);
    haptics.select();
    const { error } = prev
      ? await supabase
          .from("saved_posts")
          .delete()
          .eq("user_id", currentUserId)
          .eq("post_id", post.id)
      : await supabase
          .from("saved_posts")
          .insert({ user_id: currentUserId, post_id: post.id });
    if (error) {
      // A duplicate insert means it was already saved — the optimistic state
      // is right and the error is not worth showing.
      if (!/duplicate|unique/i.test(error.message)) {
        setSaved(prev);
        toast("Couldn't save", "error");
      }
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
          timer.current = setTimeout(() => void openPeek(), HOLD_MS);
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
          // The WebView's own long-press menu would otherwise appear on top of
          // the peek, over the image it is showing.
          if (post.image) e.preventDefault();
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

      {open && post.image && (
        <PostPeek
          src={post.image}
          author={post.author}
          caption={post.caption}
          currentUserId={currentUserId ?? ""}
          hyped={hyped}
          hypeCount={hypeCount}
          commentCount={commentCount}
          saved={saved}
          onHype={toggleHype}
          onComment={() => setCommentsOpen(true)}
          onShare={() => setShareOpen(true)}
          onSave={toggleSave}
          onClose={() => setOpen(false)}
        />
      )}

      {currentUserId && (
        <>
          <CommentsSheet
            open={commentsOpen}
            onClose={() => setCommentsOpen(false)}
            postId={post.id}
            postOwnerId={post.user_id}
            currentUserId={currentUserId}
            onCountChange={setCommentCount}
          />
          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            postId={post.id}
          />
        </>
      )}
    </>
  );
}
