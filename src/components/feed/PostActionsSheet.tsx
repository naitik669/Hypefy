"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, UserCheck, Link2, Flag, Trash2, Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";

type Action = { icon: React.ReactNode; label: string; danger?: boolean; onClick: () => void };

export function PostActionsSheet({
  open,
  onClose,
  postId,
  postUserId,
  postUsername,
  currentUserId,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  postUserId: string;
  postUsername: string | null;
  currentUserId: string;
  onDelete?: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const isOwn = postUserId === currentUserId;

  const [following, setFollowing] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reported, setReported] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch follow state when sheet opens
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
          user_id: postUserId,
          actor_id: currentUserId,
          type: "follow",
          target_type: "profile",
          target_id: postUserId,
          body: "started following you",
        });
      } else setFollowing(prev);
    } else {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", currentUserId)
        .eq("following_id", postUserId);
      if (error) setFollowing(prev);
    }
    setFollowPending(false);
  }

  async function share() {
    const url = `${window.location.origin}/p/${postId}`;
    try { if (navigator.share) { await navigator.share({ url }); onClose(); return; } } catch {}
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => { setCopied(false); onClose(); }, 1000);
  }

  function report() {
    setReported(true);
    setTimeout(() => { setReported(false); onClose(); }, 1200);
  }

  async function deletePost() {
    if (deleting) return;
    setDeleting(true);
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    setDeleting(false);
    if (!error) {
      onDelete?.();
      onClose();
      router.refresh();
    }
  }

  const actions: Action[] = [
    ...(!isOwn
      ? [
          {
            icon: followPending ? (
              <Loader2 size={19} className="animate-spin" />
            ) : following ? (
              <UserCheck size={19} className="text-accent" />
            ) : (
              <UserPlus size={19} />
            ),
            label: following ? `Unfollow @${postUsername ?? "user"}` : `Follow @${postUsername ?? "user"}`,
            onClick: toggleFollow,
          },
        ]
      : []),
    {
      icon: copied ? <Check size={19} className="text-accent" /> : <Link2 size={19} />,
      label: copied ? "Link copied!" : "Share",
      onClick: share,
    },
    ...(!isOwn
      ? [
          {
            icon: reported ? <Check size={19} className="text-accent" /> : <Flag size={19} />,
            label: reported ? "Reported" : "Report",
            danger: true,
            onClick: report,
          },
        ]
      : []),
    ...(isOwn
      ? [
          {
            icon: deleting ? <Loader2 size={19} className="animate-spin" /> : <Trash2 size={19} />,
            label: "Delete post",
            danger: true,
            onClick: deletePost,
          },
        ]
      : []),
  ];

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex flex-col pb-2">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className={`flex items-center gap-4 rounded-xl px-2 py-3.5 text-sm font-medium transition-colors hover:bg-white/5 ${
              a.danger ? "text-danger" : "text-foreground"
            }`}
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-full bg-surface ${a.danger ? "text-danger" : ""}`}>
              {a.icon}
            </span>
            {a.label}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
