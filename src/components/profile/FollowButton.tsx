"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type FollowState = "none" | "requested" | "following";

export function FollowButton({
  targetUserId,
  initialFollowing,
  initialRequested = false,
  className = "",
}: {
  currentUserId?: string;
  targetUserId: string;
  targetUsername?: string | null;
  initialFollowing: boolean;
  initialRequested?: boolean;
  className?: string;
}) {
  const supabase = createClient();
  const [state, setState] = useState<FollowState>(
    initialFollowing ? "following" : initialRequested ? "requested" : "none",
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
      const { data, error } = await supabase.rpc("follow_user", { p_target: targetUserId });
      if (error) setState(prev);
      else setState(data === "requested" ? "requested" : "following");
    } else {
      setState("none"); // covers both unfollow and cancel-request
      const { error } = await supabase.rpc("unfollow_user", { p_target: targetUserId });
      if (error) setState(prev);
    }
    setPending(false);
  }

  const label = state === "following" ? "Following" : state === "requested" ? "Requested" : "Follow";
  const filled = state === "none";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-bold transition-colors disabled:opacity-60 ${
        filled
          ? "bg-accent text-accent-ink"
          : "border border-border bg-surface text-foreground hover:bg-elevated"
      } ${className}`}
    >
      {label}
    </button>
  );
}
