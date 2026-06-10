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

    if (!prev) {
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: currentUserId, following_id: targetUserId });
      if (!error) {
        // Create follow notification
        await supabase.from("notifications").insert({
          user_id: targetUserId,
          actor_id: currentUserId,
          type: "follow",
          target_type: "profile",
          target_id: targetUserId,
          body: "started following you",
        });
      } else {
        setFollowing(prev);
      }
    } else {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", currentUserId)
        .eq("following_id", targetUserId);
      if (error) {
        setFollowing(prev);
      } else {
        // Clean up the "started following you" notification
        await supabase
          .from("notifications")
          .delete()
          .eq("user_id", targetUserId)
          .eq("actor_id", currentUserId)
          .eq("type", "follow");
      }
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
