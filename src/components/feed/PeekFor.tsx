"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import { hypeResult } from "@/lib/supabase/typed";
import { PostPeek } from "@/components/feed/PostPeek";
import { CommentsSheet } from "@/components/feed/CommentsSheet";
import { ShareSheet } from "@/components/feed/ShareSheet";
import { isRehyped, setRehype, type RehypeKind } from "@/lib/rehype";
import { BLANK_POSTER } from "@/lib/blank-poster";

/** What the peek needs to open at once: the thing, its shape, and whatever counts the caller already has. */
export type PeekTarget = {
  id: string;
  image: string | null;
  /** A Shot's video: the peek plays it, starting from `image` as its poster. */
  video?: string | null;
  aspect_ratio: number | null;
  caption?: string | null;
  user_id?: string;
  hype_count?: number;
  comment_count?: number;
};

/**
 * The peek, for something that is not on screen as a full card: a grid tile,
 * a post shared into a chat. Mount it to open it.
 *
 * It opens at once with what the caller already knows, then reads the rest —
 * whether you have hyped, saved or rehyped it, who owns it, the counts — in
 * one go. The feed card does not use this: it has all of that already.
 */
export function PeekFor({
  target,
  kind = "post",
  currentUserId,
  onClose,
  onMore,
}: {
  target: PeekTarget;
  /** A Shot's hypes, saves, comments and rehypes live in their own tables. */
  kind?: RehypeKind;
  currentUserId?: string;
  onClose: () => void;
  /** A sixth action, for a chat: the message's own menu. */
  onMore?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [ownerId, setOwnerId] = useState(target.user_id ?? "");
  const [hyped, setHyped] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rehyped, setRehyped] = useState(false);
  const [hypeCount, setHypeCount] = useState(target.hype_count ?? 0);
  const [commentCount, setCommentCount] = useState(target.comment_count ?? 0);
  const [rehypeCount, setRehypeCount] = useState(0);
  const [pending, setPending] = useState(false);
  const [rehypePending, setRehypePending] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Everything about you and this thing, read once, as it opens.
  useEffect(() => {
    let live = true;
    (async () => {
      const row =
        kind === "shot"
          ? await supabase.from("shots").select("user_id, hype_count, comment_count, repost_count").eq("id", target.id).maybeSingle()
          : await supabase.from("posts").select("user_id, hype_count, comment_count, repost_count").eq("id", target.id).maybeSingle();
      if (live && row.data) {
        setOwnerId(row.data.user_id);
        setHypeCount(row.data.hype_count ?? 0);
        setCommentCount(row.data.comment_count ?? 0);
        setRehypeCount(row.data.repost_count ?? 0);
      }
      if (!currentUserId) return;
      const [h, s, r] = await Promise.all([
        supabase
          .from("hypes")
          .select("target_id")
          .eq("user_id", currentUserId)
          .eq("target_type", kind)
          .eq("target_id", target.id)
          .maybeSingle(),
        // Saves, per kind, written out: a table name in a variable is a
        // string to the typed client, which then cannot check the column.
        kind === "shot"
          ? supabase.from("saved_shots").select("shot_id").eq("user_id", currentUserId).eq("shot_id", target.id).maybeSingle()
          : supabase.from("saved_posts").select("post_id").eq("user_id", currentUserId).eq("post_id", target.id).maybeSingle(),
        isRehyped(supabase as never, currentUserId, kind, target.id),
      ]);
      if (!live) return;
      setHyped(!!h.data);
      setSaved(!!s.data);
      setRehyped(r);
    })();
    return () => {
      live = false;
    };
  }, [kind, target.id, currentUserId, supabase]);

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
        p_target_id: target.id,
        p_owner_id: ownerId || undefined,
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
    const write =
      kind === "shot"
        ? prev
          ? supabase.from("saved_shots").delete().eq("user_id", currentUserId).eq("shot_id", target.id)
          : supabase.from("saved_shots").insert({ user_id: currentUserId, shot_id: target.id })
        : prev
          ? supabase.from("saved_posts").delete().eq("user_id", currentUserId).eq("post_id", target.id)
          : supabase.from("saved_posts").insert({ user_id: currentUserId, post_id: target.id });
    const { error } = await write;
    // A duplicate insert means it was already saved: the optimistic state is right.
    if (error && !/duplicate|unique/i.test(error.message)) {
      setSaved(prev);
      toast("Couldn't save", "error");
    }
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
    setRehypeCount((c) => Math.max(0, c + (prev ? -1 : 1)));
    haptics.select();
    const res = await setRehype(supabase as never, currentUserId, kind, target.id, !prev);
    setRehypePending(false);
    if (res.ok) {
      setRehyped(res.rehyped);
      if (!prev) toast("Rehyped to your followers", "success");
      return;
    }
    setRehyped(prev);
    setRehypeCount((c) => Math.max(0, c + (prev ? 1 : -1)));
    toast(res.reason === "not-allowed" ? "Private accounts can't be rehyped." : "Couldn't rehype. Try again.", "error");
  }

  return (
    <>
      <PostPeek
        src={target.image || BLANK_POSTER}
        videoSrc={target.video ?? undefined}
        aspectRatio={target.aspect_ratio}
        postId={target.id}
        targetType={kind}
        caption={target.caption ?? null}
        hyped={hyped}
        hypeCount={hypeCount}
        commentCount={commentCount}
        saved={saved}
        rehyped={rehyped}
        rehypeCount={rehypeCount}
        onRehype={() => void toggleRehype()}
        onHype={() => void toggleHype()}
        onComment={() => setCommentsOpen(true)}
        onShare={() => setShareOpen(true)}
        onSave={() => void toggleSave()}
        onMore={onMore}
        onClose={onClose}
      />
      {currentUserId && (
        <>
          <CommentsSheet
            open={commentsOpen}
            onClose={() => setCommentsOpen(false)}
            targetType={kind}
            postId={target.id}
            postOwnerId={ownerId}
            currentUserId={currentUserId}
            onCountChange={setCommentCount}
          />
          <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} targetType={kind} postId={target.id} />
        </>
      )}
    </>
  );
}
