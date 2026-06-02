"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import type { SuggestedUser } from "@/lib/mock-discover";

export function UserSuggestionCard({ user }: { user: SuggestedUser }) {
  const [following, setFollowing] = useState(false);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Avatar name={user.name} hue={user.hue} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-sm font-semibold">{user.name}</span>
          {user.verified && (
            <VerifiedStar className="h-5 w-5 shrink-0 text-verified" />
          )}
        </div>
        <p className="truncate text-xs text-muted">{user.handle}</p>
      </div>
      <button
        type="button"
        onClick={() => setFollowing((v) => !v)}
        className={`shrink-0 rounded-pill px-4 py-1.5 text-xs font-bold transition-colors ${
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
