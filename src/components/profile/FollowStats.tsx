"use client";

import { useState } from "react";
import { FollowListSheet } from "@/components/profile/FollowListSheet";
import { formatCount } from "@/lib/format";

export function FollowStats({
  userId,
  currentUserId,
  posts,
  followers,
  following,
}: {
  userId: string;
  currentUserId: string | null;
  posts: number;
  followers: number;
  following: number;
}) {
  const [sheet, setSheet] = useState<"followers" | "following" | null>(null);

  return (
    <>
      <div className="flex flex-1 pb-1">
        {/* Posts (not clickable) */}
        <div className="flex flex-1 flex-col items-center gap-0.5">
          <span className="text-lg font-bold tabular-nums leading-none">{formatCount(posts)}</span>
          <span className="text-xs text-muted">Posts</span>
        </div>

        {/* Followers */}
        <button type="button" onClick={() => setSheet("followers")} className="flex flex-1 flex-col items-center gap-0.5 active:opacity-70">
          <span className="text-lg font-bold tabular-nums leading-none">{formatCount(followers)}</span>
          <span className="text-xs text-muted">Followers</span>
        </button>

        {/* Following */}
        <button type="button" onClick={() => setSheet("following")} className="flex flex-1 flex-col items-center gap-0.5 active:opacity-70">
          <span className="text-lg font-bold tabular-nums leading-none">{formatCount(following)}</span>
          <span className="text-xs text-muted">Following</span>
        </button>
      </div>

      {sheet && (
        <FollowListSheet
          open
          onClose={() => setSheet(null)}
          userId={userId}
          mode={sheet}
          currentUserId={currentUserId}
        />
      )}
    </>
  );
}
