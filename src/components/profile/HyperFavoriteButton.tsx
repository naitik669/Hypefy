"use client";

import { useState } from "react";
import { MoreHorizontal, Star, Heart, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { haptics } from "@/lib/haptics";

/**
 * Overflow menu on a public profile for adding this person to your Hypers
 * (closest friends — backed by close_friends) or Favourites (backed by
 * favorites). Both are private, personal lists that scope the Home feed's
 * Hypers / Favourite tabs — the other person is never notified either way.
 */
export function HyperFavoriteButton({
  currentUserId,
  targetUserId,
  initialHyper,
  initialFavourite,
}: {
  currentUserId: string;
  targetUserId: string;
  initialHyper: boolean;
  initialFavourite: boolean;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [isHyper, setIsHyper] = useState(initialHyper);
  const [isFavourite, setIsFavourite] = useState(initialFavourite);
  const [pending, setPending] = useState<"hyper" | "favourite" | null>(null);

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
              <p className="text-xs text-muted">Your closest friends — see their posts here first</p>
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
        </div>
      </BottomSheet>
    </>
  );
}
