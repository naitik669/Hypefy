"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function FollowButton({
  currentUserId,
  targetUserId,
  targetUsername,
  initialFollowing,
  className = "",
}: {
  currentUserId: string;
  targetUserId: string;
  targetUsername: string | null;
  initialFollowing: boolean;
  className?: string;
}) {
  const supabase = createClient();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    const prev = following;
    setFollowing(!prev);
    setPending(true);

    // follow_user / unfollow_user are SECURITY DEFINER RPCs that own the follow
    // row + its notification (clients can no longer insert notifications).
    if (!prev) {
      const { error } = await supabase.rpc("follow_user", { p_target: targetUserId });
      if (error) setFollowing(prev);
    } else {
      const { error } = await supabase.rpc("unfollow_user", { p_target: targetUserId });
      if (error) setFollowing(prev);
    }
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-bold transition-colors disabled:opacity-60 ${
        following
          ? "border border-border bg-surface text-foreground hover:bg-elevated"
          : "bg-accent text-accent-ink"
      } ${className}`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
