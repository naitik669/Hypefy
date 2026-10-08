"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, UserCheck, Link2, Flag, Trash2, Pencil, Star, Ban, EyeOff, VolumeX, Archive, MessageCircle, MessageCircleOff } from "lucide-react";
import { setArchived, setCommentsOff } from "@/lib/post-controls";
import { hideContent, muteUser, QUIET_COPY } from "@/lib/feed-quiet";
import { createClient } from "@/lib/supabase/client";
import { ReportSheet } from "@/components/ui/ReportSheet";
import { FloatingMenu, MenuItem, MenuDivider } from "@/components/ui/FloatingMenu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { scheduleUndoable } from "@/lib/undoable";

/**
 * Post ··· menu — anchored popover at the card's top-right (FloatingMenu
 * shell), with report portaled to a sheet and delete gated behind a
 * confirmation dialog.
 */
export function PostActionsSheet({
  open,
  onClose,
  postId,
  postUserId,
  postUsername,
  currentUserId,
  onDelete,
  onRestore,
  preview,
  onEdit,
  onHyperChange,
  onHide,
}: {
  /** Not interested, or the author was muted: take the post off the screen. */
  onHide?: () => void;
  open: boolean;
  onClose: () => void;
  postId: string;
  postUserId: string;
  postUsername: string | null;
  currentUserId: string;
  onDelete?: () => void;
  /** Undo was tapped: put the post back on screen. */
  onRestore?: () => void;
  /** For the Undo card: the post's first image and caption. */
  preview?: { image?: string | null; caption?: string | null };
  onEdit?: () => void;
  onHyperChange?: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const isOwn = postUserId === currentUserId;
  /** Whether this post is taking comments. Only its author is told. */
  const [commentsOff, setCommentsOffState] = useState(false);
  const [ownerBusy, setOwnerBusy] = useState<"archive" | "comments" | null>(null);

  useEffect(() => {
    if (!open || !isOwn) return;
    let alive = true;
    void supabase
      .from("posts")
      .select("comments_off")
      .eq("id", postId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setCommentsOffState(!!(data as { comments_off?: boolean } | null)?.comments_off);
      });
    return () => {
      alive = false;
    };
  }, [open, isOwn, postId, supabase]);

  async function archive() {
    setOwnerBusy("archive");
    const problem = await setArchived(supabase, "post", postId, true);
    setOwnerBusy(null);
    if (problem) {
      toast(problem, "error");
      return;
    }
    onClose();
    // It leaves every feed at once, so take it off this screen too.
    onDelete?.();
    toast("Moved to your archive", "plain", { label: "Settings", onClick: () => router.push("/settings/archive") });
    router.refresh();
  }

  async function toggleComments() {
    const next = !commentsOff;
    setOwnerBusy("comments");
    const problem = await setCommentsOff(supabase, "post", postId, next);
    setOwnerBusy(null);
    if (problem) {
      toast(problem, "error");
      return;
    }
    setCommentsOffState(next);
    onClose();
    toast(next ? "Comments are off for this post" : "Comments are back on");
  }

  const [following, setFollowing] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [isHyper, setIsHyper] = useState(false);
  const [hyperPending, setHyperPending] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  // Fetch follow + Hyper state when opened
  useEffect(() => {
    if (!open || isOwn || !currentUserId) return;
    supabase
      .from("follows")
      .select("id")
      .eq("follower_id", currentUserId)
      .eq("following_id", postUserId)
      .maybeSingle()
      .then(({ data }) => setFollowing(!!data));
    supabase
      .from("close_friends")
      .select("user_id")
      .eq("user_id", currentUserId)
      .eq("friend_id", postUserId)
      .maybeSingle()
      .then(({ data }) => setIsHyper(!!data));
  }, [open, isOwn, currentUserId, postUserId, supabase]);

  if (!open && !confirmBlock) return null;

  async function toggleFollow() {
    if (followPending) return;
    setFollowPending(true);
    const prev = following;
    setFollowing(!prev);
    if (!prev) {
      const { error } = await supabase.rpc("follow_user", { p_target: postUserId });
      if (!error) toast(`Following @${postUsername ?? "user"}`, "success");
      else setFollowing(prev);
    } else {
      const { error } = await supabase.rpc("unfollow_user", { p_target: postUserId });
      if (error) setFollowing(prev);
    }
    setFollowPending(false);
    onClose();
  }

  async function toggleHyper() {
    if (hyperPending) return;
    setHyperPending(true);
    const prev = isHyper;
    setIsHyper(!prev);
    const { error } = prev
      ? await supabase.from("close_friends").delete().eq("user_id", currentUserId).eq("friend_id", postUserId)
      : await supabase.from("close_friends").insert({ user_id: currentUserId, friend_id: postUserId });
    if (error) setIsHyper(prev);
    else {
      toast(prev ? "Removed from Hypers" : "Added to Hypers ★", "success");
      onHyperChange?.();
      router.refresh();
    }
    setHyperPending(false);
    onClose();
  }

  async function notInterested() {
    onClose();
    if (await hideContent(supabase, "post", postId)) {
      onHide?.();
      toast(QUIET_COPY.hidden, "success");
    } else toast(QUIET_COPY.hideFailed, "error");
  }

  async function mute() {
    onClose();
    if (await muteUser(supabase, postUserId)) {
      onHide?.();
      toast(QUIET_COPY.muted(`@${postUsername ?? "user"}`), "success");
    } else toast(QUIET_COPY.muteFailed, "error");
  }

  async function share() {
    const url = `${window.location.origin}/p/${postId}`;
    try { if (navigator.share) { await navigator.share({ url }); onClose(); return; } } catch {}
    await navigator.clipboard.writeText(url).catch(() => {});
    toast("Link copied", "success");
    onClose();
  }

  async function blockAuthor() {
    const { error } = await supabase.rpc("block_user", { p_blocked: postUserId });
    if (error) {
      toast("Couldn't block, try again", "error");
      return;
    }
    setConfirmBlock(false);
    onClose();
    toast(`Blocked @${postUsername ?? "user"}`, "success");
    router.refresh();
  }

  function deletePost() {
    // The post leaves the screen now and the row is deleted in five seconds.
    // It cannot be done the other way round: posts are hard-deleted, so once
    // the DELETE has run there is nothing left to restore and an Undo button
    // would be a lie.
    onDelete?.();
    onClose();

    const cancel = scheduleUndoable(async () => {
      const { error } = await supabase.from("posts").delete().eq("id", postId);
      if (error) {
        toast("Couldn't delete post", "error");
        // Bring it back rather than leaving a post that looks deleted and
        // is still there for everyone else.
        router.refresh();
        return;
      }
      router.refresh();
    });

    toast("Post deleted", "plain", {
      label: "Undo",
      detail: preview?.caption?.trim() || "Your post",
      thumb: { src: preview?.image ?? null, name: preview?.caption ?? "Post" },
      onClick: () => {
        cancel();
        // The card removed itself optimistically; this is what puts it back.
        onRestore?.();
        router.refresh();
      },
    });
  }

  return (
    <>
      <FloatingMenu
        open={open}
        onClose={onClose}
        className="absolute right-4 top-12 min-w-[200px]"
        notch
      >
        {!isOwn && (
          <MenuItem
            icon={following ? UserCheck : UserPlus}
            active={following}
            pending={followPending}
            label={following ? `Unfollow @${postUsername ?? "user"}` : `Follow @${postUsername ?? "user"}`}
            onClick={toggleFollow}
          />
        )}
        {!isOwn && (
          <MenuItem
            icon={Star}
            active={isHyper}
            pending={hyperPending}
            label={isHyper ? "Remove from Hypers" : "Add to Hypers"}
            onClick={toggleHyper}
          />
        )}
        <MenuItem icon={Link2} label="Share" onClick={share} />
        {!isOwn && (
          <>
            <MenuDivider />
            <MenuItem icon={EyeOff} label="Not interested" onClick={notInterested} />
            <MenuItem icon={VolumeX} label={`Mute @${postUsername ?? "user"}`} onClick={mute} />
            <MenuItem
              icon={Ban}
              label={`Block @${postUsername ?? "user"}`}
              danger
              onClick={() => { setConfirmBlock(true); onClose(); }}
            />
            <MenuItem icon={Flag} label="Report" danger onClick={() => setShowReport(true)} />
          </>
        )}
        {isOwn && (
          <>
            <MenuDivider />
            <MenuItem icon={Pencil} label="Edit post" onClick={() => { onClose(); onEdit?.(); }} />
            <MenuItem
              icon={commentsOff ? MessageCircleOff : MessageCircle}
              label={commentsOff ? "Turn comments on" : "Turn comments off"}
              pending={ownerBusy === "comments"}
              onClick={() => void toggleComments()}
            />
            <MenuItem
              icon={Archive}
              label="Archive"
              sub="Only you can see it"
              pending={ownerBusy === "archive"}
              onClick={() => void archive()}
            />
            <MenuItem icon={Trash2} label="Delete post" danger onClick={deletePost} />
          </>
        )}
      </FloatingMenu>

      <ConfirmDialog
        open={confirmBlock}
        onClose={() => { setConfirmBlock(false); onClose(); }}
        onConfirm={blockAuthor}
        icon={Ban}
        title={`Block @${postUsername ?? "user"}`}
        body="They won't be able to message or call you, and their posts vanish from your feeds. They aren't notified."
        confirmLabel="Block"
      />

      <ReportSheet
        open={showReport}
        onClose={() => { setShowReport(false); onClose(); }}
        targetType="post"
        targetId={postId}
        currentUserId={currentUserId}
      />
    </>
  );
}
