"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Star, Heart, Check, Ban, Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ReportSheet } from "@/components/ui/ReportSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";

/**
 * Overflow menu on a public profile: personal lists (Hypers / Favourites —
 * private, the other person is never notified) plus the safety actions —
 * block/unblock and report.
 */
export function HyperFavoriteButton({
  currentUserId,
  targetUserId,
  targetUsername,
  initialHyper,
  initialFavourite,
}: {
  currentUserId: string;
  targetUserId: string;
  targetUsername?: string | null;
  initialHyper: boolean;
  initialFavourite: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [isHyper, setIsHyper] = useState(initialHyper);
  const [isFavourite, setIsFavourite] = useState(initialFavourite);
  const [pending, setPending] = useState<"hyper" | "favourite" | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // Blocked state loads lazily when the sheet opens.
  useEffect(() => {
    if (!open) return;
    supabase
      .from("blocked_users")
      .select("id")
      .eq("blocker_id", currentUserId)
      .eq("blocked_id", targetUserId)
      .maybeSingle()
      .then(({ data }) => setIsBlocked(!!data));
  }, [open, currentUserId, targetUserId, supabase]);

  async function blockUser() {
    const { error } = await supabase.rpc("block_user", { p_blocked: targetUserId });
    if (error) {
      toast("Couldn't block, try again", "error");
      return;
    }
    setConfirmBlock(false);
    setOpen(false);
    toast(`Blocked ${targetUsername ? `@${targetUsername}` : "user"}`, "success");
    router.push("/home");
    router.refresh();
  }

  async function unblockUser() {
    haptics.select();
    const { error } = await supabase
      .from("blocked_users")
      .delete()
      .eq("blocker_id", currentUserId)
      .eq("blocked_id", targetUserId);
    if (error) {
      toast("Couldn't unblock, try again", "error");
      return;
    }
    setIsBlocked(false);
    toast("Unblocked", "success");
    router.refresh();
  }

  async function toggleHyper() {
    if (pending) return;
    setPending("hyper");
    haptics.select();
    const prev = isHyper;
    setIsHyper(!prev);
    const { error } = prev
      ? await supabase.from("close_friends").delete().eq("user_id", currentUserId).eq("friend_id", targetUserId)
      : await supabase.from("close_friends").insert({ user_id: currentUserId, friend_id: targetUserId });
    if (error) setIsHyper(prev);
    setPending(null);
  }

  async function toggleFavourite() {
    if (pending) return;
    setPending("favourite");
    haptics.select();
    const prev = isFavourite;
    setIsFavourite(!prev);
    const { error } = prev
      ? await supabase.from("favorites").delete().eq("user_id", currentUserId).eq("friend_id", targetUserId)
      : await supabase.from("favorites").insert({ user_id: currentUserId, friend_id: targetUserId });
    if (error) setIsFavourite(prev);
    setPending(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="More options"
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
          isHyper || isFavourite
            ? "border-accent/40 bg-accent/[0.08] text-accent"
            : "border-border bg-surface text-foreground hover:bg-elevated"
        }`}
      >
        <MoreHorizontal size={18} />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Add to…">
        <div className="flex flex-col gap-1 pb-2">
          <button
            type="button"
            onClick={toggleHyper}
            disabled={pending !== null}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-white/5 disabled:opacity-60"
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isHyper ? "bg-accent/15 text-accent" : "bg-surface text-muted"}`}>
              <Star size={18} className={isHyper ? "fill-accent" : ""} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Hypers</p>
              <p className="text-xs text-muted">Your closest friends, see their posts here first</p>
            </div>
            {isHyper && <Check size={18} className="shrink-0 text-accent" />}
          </button>

          <button
            type="button"
            onClick={toggleFavourite}
            disabled={pending !== null}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-white/5 disabled:opacity-60"
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isFavourite ? "bg-accent/15 text-accent" : "bg-surface text-muted"}`}>
              <Heart size={18} className={isFavourite ? "fill-accent" : ""} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Favourites</p>
              <p className="text-xs text-muted">Pin their posts to your Favourite feed</p>
            </div>
            {isFavourite && <Check size={18} className="shrink-0 text-accent" />}
          </button>

          {/* Safety actions */}
          <div className="mx-2 my-1 h-px bg-border" />

          {isBlocked ? (
            <button
              type="button"
              onClick={unblockUser}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-white/5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                <Ban size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Unblock{targetUsername ? ` @${targetUsername}` : ""}</p>
                <p className="text-xs text-muted">They can find and message you again</p>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmBlock(true)}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-danger/5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
                <Ban size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-danger">Block{targetUsername ? ` @${targetUsername}` : ""}</p>
                <p className="text-xs text-muted">Their posts disappear and they can't message or call you</p>
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-danger/5"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
              <Flag size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-danger">Report{targetUsername ? ` @${targetUsername}` : ""}</p>
              <p className="text-xs text-muted">They won't know it came from you</p>
            </div>
          </button>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={blockUser}
        icon={Ban}
        title={`Block ${targetUsername ? `@${targetUsername}` : "this user"}`}
        body="They won't be able to message or call you, and their posts vanish from your feeds. They aren't notified."
        confirmLabel="Block"
      />

      <ReportSheet
        open={reportOpen}
        onClose={() => { setReportOpen(false); setOpen(false); }}
        targetType="profile"
        targetId={targetUserId}
        currentUserId={currentUserId}
      />
    </>
  );
}
