"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import { hypeResult } from "@/lib/supabase/typed";
import { PostPeek, type PeekAuthor } from "@/components/feed/PostPeek";
import { CommentsSheet } from "@/components/feed/CommentsSheet";
import { ShareSheet } from "@/components/feed/ShareSheet";
import { isRehyped, setRehype, type RehypeKind } from "@/lib/rehype";
import { BLANK_POSTER } from "@/lib/blank-poster";

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
  kind = "post",
  currentUserId,
  className = "",
  children,
}: {
  post: PeekablePost;
  /**
   * Which of the two things this tile is.
   *
   * A Shot's hypes, saves, comments and rehypes all live in their own tables,
   * so one wrong default here is silently counting against a post that does
   * not exist. Everything below reads this rather than assuming "post".
   */
  kind?: RehypeKind;
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
  const [rehyped, setRehyped] = useState(false);
  const [rehypePending, setRehypePending] = useState(false);

  /**
   * Saves, per kind, written out rather than parameterised.
   *
   * A table name held in a variable is a `string` to the typed client, which
   * then cannot check the column against it — the one mistake worth catching
   * here is saving a Shot into saved_posts, and that is exactly the mistake a
   * string table name hides.
   */
  async function readSaved(userId: string): Promise<boolean> {
    if (kind === "shot") {
      const { data } = await supabase
        .from("saved_shots")
        .select("shot_id")
        .eq("user_id", userId)
        .eq("shot_id", post.id)
        .maybeSingle();
      return !!data;
    }
    const { data } = await supabase
      .from("saved_posts")
      .select("post_id")
      .eq("user_id", userId)
      .eq("post_id", post.id)
      .maybeSingle();
    return !!data;
  }

  function writeSaved(userId: string, next: boolean) {
    if (kind === "shot") {
      return next
        ? supabase.from("saved_shots").insert({ user_id: userId, shot_id: post.id })
        : supabase.from("saved_shots").delete().eq("user_id", userId).eq("shot_id", post.id);
    }
    return next
      ? supabase.from("saved_posts").insert({ user_id: userId, post_id: post.id })
      : supabase.from("saved_posts").delete().eq("user_id", userId).eq("post_id", post.id);
  }

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
    // A Shot may have no poster at all, and a Shot with no poster is exactly
    // the one you most want to hold to find out what it is.
    if (!post.image && !post.video) return;
    held.current = true;
    haptics.select();
    setOpen(true);

    if (!currentUserId) return;
    const [h, s, r] = await Promise.all([
      supabase
        .from("hypes")
        .select("target_id")
        .eq("user_id", currentUserId)
        .eq("target_type", kind)
        .eq("target_id", post.id)
        .maybeSingle(),
      readSaved(currentUserId),
      isRehyped(supabase as never, currentUserId, kind, post.id),
    ]);
    setHyped(!!h.data);
    setSaved(s);
    setRehyped(r);
  }

  async function toggleRehype() {
    if (rehypePending) return;
    if (!currentUserId) {
      toast("Sign in to rehype");
      return;
    }
    const prev = rehyped;
    setRehypePending(true);
    setRehyped(!prev);
    haptics.select();
    const res = await setRehype(supabase as never, currentUserId, kind, post.id, !prev);
    setRehypePending(false);
    if (res.ok) {
      setRehyped(res.rehyped);
      if (!prev) toast("Rehyped to your followers", "success");
      return;
    }
    setRehyped(prev);
    toast(
      res.reason === "not-allowed"
        ? "Private accounts can't be rehyped."
        : "Couldn't rehype. Try again.",
      "error",
    );
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
        p_target_type: kind,
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
    const { error } = await writeSaved(currentUserId, !prev);
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
          if (post.image || post.video) e.preventDefault();
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

      {open && (post.image || post.video) && (
        <PostPeek
          src={post.image || BLANK_POSTER}
          videoSrc={post.video ?? undefined}
          aspectRatio={post.aspect_ratio}
          postId={post.id}
          targetType={kind}
          author={post.author}
          caption={post.caption}
          currentUserId={currentUserId ?? ""}
          hyped={hyped}
          hypeCount={hypeCount}
          commentCount={commentCount}
          saved={saved}
          rehyped={rehyped}
          onRehype={toggleRehype}
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
            targetType={kind}
            postId={post.id}
            postOwnerId={post.user_id}
            currentUserId={currentUserId}
            onCountChange={setCommentCount}
          />
          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            targetType={kind}
            postId={post.id}
          />
        </>
      )}
    </>
  );
}
