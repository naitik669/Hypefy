"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, UserCheck, Link2, Flag, Trash2, Pencil, Star, Ban } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ReportSheet } from "@/components/ui/ReportSheet";
import { FloatingMenu, MenuItem, MenuDivider } from "@/components/ui/FloatingMenu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";

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
  onEdit,
  onHyperChange,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  postUserId: string;
  postUsername: string | null;
  currentUserId: string;
  onDelete?: () => void;
  onEdit?: () => void;
  onHyperChange?: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const isOwn = postUserId === currentUserId;

  const [following, setFollowing] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [isHyper, setIsHyper] = useState(false);
  const [hyperPending, setHyperPending] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  if (!open && !confirmDelete && !confirmBlock) return null;

  async function toggleFollow() {
    if (followPending) return;
    setFollowPending(true);
    const prev = following;
    setFollowing(!prev);
    if (!prev) {
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: currentUserId, following_id: postUserId });
      if (!error) {
        await supabase.from("notifications").insert({
          user_id: postUserId, actor_id: currentUserId,
          type: "follow", target_type: "profile", target_id: postUserId,
          body: "started following you",
        });
        toast(`Following @${postUsername ?? "user"}`, "success");
      } else setFollowing(prev);
    } else {
      const { error } = await supabase.from("follows").delete()
        .eq("follower_id", currentUserId).eq("following_id", postUserId);
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
      toast("Couldn't block — try again", "error");
      return;
    }
    setConfirmBlock(false);
    onClose();
    toast(`Blocked @${postUsername ?? "user"}`, "success");
    router.refresh();
  }

  async function deletePost() {
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) {
      toast("Couldn't delete post", "error");
      return;
    }
    setConfirmDelete(false);
    onDelete?.();
    onClose();
    router.refresh();
    toast("Post deleted");
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
            <MenuItem icon={Trash2} label="Delete post" danger onClick={() => { setConfirmDelete(true); onClose(); }} />
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

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => { setConfirmDelete(false); onClose(); }}
        onConfirm={deletePost}
        icon={Trash2}
        title="Delete this post"
        body="It disappears from every feed, along with its hypes and comments. There's no undo."
        confirmLabel="Delete post"
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
