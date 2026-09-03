"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";

type FollowState = "none" | "requested" | "following";

export function FollowButton({
  targetUserId,
  initialFollowing,
  initialRequested = false,
  variant = "block",
  className = "",
}: {
  currentUserId?: string;
  targetUserId: string;
  targetUsername?: string | null;
  initialFollowing: boolean;
  initialRequested?: boolean;
  /** "block" fills its row (profile header, sheets). "inline" is a pill sized
   *  to sit at the end of a list row without stretching it. */
  variant?: "block" | "inline";
  className?: string;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [state, setState] = useState<FollowState>(
    initialFollowing ? "following" : initialRequested ? "requested" : "none"
  );
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    const prev = state;
    setPending(true);

    // follow_user / unfollow_user are SECURITY DEFINER RPCs that own the follow
    // row + its notification, and gate private accounts behind a request.
    if (prev === "none") {
      setState("following"); // optimistic; corrected from the RPC's return
      const { data, error } = await supabase.rpc("follow_user", {
        p_target: targetUserId,
      });
      // A follow that silently reverts is the one failure that quietly
      // produces an empty feed later, so it has to be said out loud.
      if (error) {
        setState(prev);
        toast("Couldn't follow. Try again.", "error");
      } else setState(data === "requested" ? "requested" : "following");
    } else {
      setState("none"); // covers both unfollow and cancel-request
      const { error } = await supabase.rpc("unfollow_user", {
        p_target: targetUserId,
      });
      if (error) {
        setState(prev);
        toast("Couldn't update that. Try again.", "error");
      }
    }
    setPending(false);
  }

  const label =
    state === "following"
      ? "Following"
      : state === "requested"
      ? "Requested"
      : "Follow";
  const filled = state === "none";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`flex items-center justify-center font-bold transition-colors disabled:opacity-60 ${
        variant === "inline"
          ? "h-8 shrink-0 rounded-pill px-4 text-xs"
          : "h-10 flex-1 rounded-xl text-sm"
      } ${
        filled
          ? "bg-accent text-accent-ink"
          : "border border-border bg-surface text-foreground hover:bg-elevated"
      } ${className}`}
    >
      {label}
    </button>
  );
}
