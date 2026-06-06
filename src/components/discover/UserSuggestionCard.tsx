"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import type { SuggestedUser } from "@/lib/mock-discover";

export function UserSuggestionCard({ user }: { user: SuggestedUser & { avatarUrl?: string | null } }) {
  const supabase = createClient();
  const [following, setFollowing] = useState(false);
  const [pending, setPending] = useState(false);

  const profileHref = user.handle ? `/u/${user.handle.replace("@", "")}` : "#";

  async function toggle() {
    if (pending) return;
    setPending(true);
    const prev = following;
    setFollowing(!prev);

    // Need current user id
    const { data: { user: me } } = await supabase.auth.getUser();
    if (!me) { setFollowing(prev); setPending(false); return; }

    if (!prev) {
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: me.id, following_id: user.id });
      if (!error) {
        await supabase.from("notifications").insert({
          user_id: user.id,
          actor_id: me.id,
          type: "follow",
          target_type: "profile",
          target_id: user.id,
          body: "started following you",
        });
      } else {
        setFollowing(prev);
      }
    } else {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", me.id)
        .eq("following_id", user.id);
      if (error) setFollowing(prev);
    }
    setPending(false);
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Link href={profileHref}>
        <Avatar name={user.name} hue={user.hue} size={44} src={user.avatarUrl ?? undefined} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={profileHref} className="flex items-center gap-1 hover:underline">
          <span className="truncate text-sm font-semibold">{user.name}</span>
          {user.verified && <VerifiedStar className="h-5 w-5 shrink-0 text-verified" />}
        </Link>
        <p className="truncate text-xs text-muted">{user.handle}</p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`shrink-0 rounded-xl px-4 py-1.5 text-xs font-bold transition-colors disabled:opacity-60 ${
          following
            ? "border border-border text-foreground"
            : "bg-accent text-accent-ink"
        }`}
      >
        {following ? "Following" : "Follow"}
      </button>
    </div>
  );
}
