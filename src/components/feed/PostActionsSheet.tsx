"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, UserCheck, Link2, Flag, Trash2, Check, Loader2, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Floating dropdown popover that appears near the ··· button.
 * Not a bottom sheet — renders as a card positioned at the top-right
 * of the post card, just below where the button was tapped.
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
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  postUserId: string;
  postUsername: string | null;
  currentUserId: string;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const isOwn = postUserId === currentUserId;

  const [following, setFollowing] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reported, setReported] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch follow state when opened
  useEffect(() => {
    if (!open || isOwn || !currentUserId) return;
    supabase
      .from("follows")
      .select("id")
      .eq("follower_id", currentUserId)
      .eq("following_id", postUserId)
      .maybeSingle()
      .then(({ data }) => setFollowing(!!data));
  }, [open, isOwn, currentUserId, postUserId, supabase]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, onClose]);

  if (!open) return null;

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
      } else setFollowing(prev);
    } else {
      const { error } = await supabase.from("follows").delete()
        .eq("follower_id", currentUserId).eq("following_id", postUserId);
      if (error) setFollowing(prev);
    }
    setFollowPending(false);
    onClose();
  }

  async function share() {
    const url = `${window.location.origin}/p/${postId}`;
    try { if (navigator.share) { await navigator.share({ url }); onClose(); return; } } catch {}
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => { setCopied(false); onClose(); }, 800);
  }

  async function report() {
    setReported(true);
    await supabase
      .from("reports")
      .insert({ reporter_id: currentUserId, target_type: "post", target_id: postId, reason: "post" });
    setTimeout(() => { setReported(false); onClose(); }, 900);
  }

  async function deletePost() {
    if (deleting) return;
    setDeleting(true);
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    setDeleting(false);
    if (!error) { onDelete?.(); onClose(); router.refresh(); }
  }

  return (
    <>
      {/* Invisible backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Floating card — positioned at top-right of the post (CSS from parent) */}
      <div
        ref={menuRef}
        className="absolute right-4 top-12 z-50 min-w-[190px] overflow-hidden rounded-2xl border border-border bg-elevated shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl"
      >
        {/* Small notch/triangle pointing up toward the button */}
        <div className="absolute -top-2 right-4 h-3 w-3 rotate-45 border-l border-t border-border bg-elevated" />

        <div className="flex flex-col py-1.5">
          {/* Follow / Unfollow (only other users) */}
          {!isOwn && (
            <button type="button" onClick={toggleFollow}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-white/5 active:bg-white/8"
            >
              {followPending ? (
                <Loader2 size={17} className="animate-spin text-muted" />
              ) : following ? (
                <UserCheck size={17} className="text-accent" />
              ) : (
                <UserPlus size={17} className="text-muted" />
              )}
              {following ? `Unfollow @${postUsername ?? "user"}` : `Follow @${postUsername ?? "user"}`}
            </button>
          )}

          {/* Share */}
          <button type="button" onClick={share}
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-white/5"
          >
            {copied ? <Check size={17} className="text-accent" /> : <Link2 size={17} className="text-muted" />}
            {copied ? "Copied!" : "Share"}
          </button>

          {/* Report (only other users' posts) */}
          {!isOwn && (
            <>
              <div className="mx-3 my-1 h-px bg-border" />
              <button type="button" onClick={report}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-danger hover:bg-danger/5"
              >
                {reported ? <Check size={17} /> : <Flag size={17} />}
                {reported ? "Reported" : "Report"}
              </button>
            </>
          )}

          {/* Delete (own posts) */}
          {isOwn && (
            <>
              <div className="mx-3 my-1 h-px bg-border" />
              <button type="button" onClick={() => { onClose(); onEdit?.(); }}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-white/5"
              >
                <Pencil size={17} className="text-muted" />
                Edit post
              </button>
              <button type="button" onClick={deletePost}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-danger hover:bg-danger/5"
              >
                {deleting ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
                {deleting ? "Deleting…" : "Delete post"}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
