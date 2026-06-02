"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function FollowButton({
  targetUserId,
  currentUserId,
  initialFollowing,
}: {
  targetUserId: string;
  currentUserId: string;
  initialFollowing: boolean;
}) {
  const supabase = createClient();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const was = following;
    setFollowing(!was); // optimistic
    startTransition(async () => {
      if (was) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", currentUserId)
          .eq("following_id", targetUserId);
        if (error) setFollowing(was); // rollback
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({ follower_id: currentUserId, following_id: targetUserId });
        if (error) setFollowing(was); // rollback
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`flex h-10 items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-bold transition-colors disabled:opacity-60 ${
        following
          ? "border border-border bg-transparent text-foreground hover:bg-white/5"
          : "bg-accent text-accent-ink hover:bg-accent/90"
      }`}
    >
      {pending && <Loader2 size={14} className="animate-spin" />}
      {following ? "Following" : "Follow"}
    </button>
  );
}
