"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { FollowButton } from "@/components/profile/FollowButton";

type Row = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
};

export function FollowListSheet({
  open,
  onClose,
  userId,
  mode,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  mode: "followers" | "following";
  currentUserId: string | null;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    async function load() {
      // Followers: people who follow userId → join the follower's profile
      // Following: people userId follows → join the following's profile
      const joinCol = mode === "followers" ? "follower_id" : "following_id";
      const matchCol = mode === "followers" ? "following_id" : "follower_id";

      const { data } = await supabase
        .from("follows")
        .select(`profile:profiles!${joinCol}(id, display_name, username, avatar_hue)`)
        .eq(matchCol, userId)
        .limit(100);

      const list: Row[] = (data ?? [])
        .map((r: any) => (Array.isArray(r.profile) ? r.profile[0] : r.profile))
        .filter(Boolean);
      setRows(list);

      // Which of these does the current user already follow?
      if (currentUserId && list.length > 0) {
        const { data: mine } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", currentUserId)
          .in("following_id", list.map((r) => r.id));
        setFollowingSet(new Set((mine ?? []).map((m: any) => m.following_id)));
      }
      setLoading(false);
    }
    load();
  }, [open, userId, mode, currentUserId, supabase]);

  return (
    <BottomSheet open={open} onClose={onClose} title={mode === "followers" ? "Followers" : "Following"}>
      <div className="flex flex-col pb-3" style={{ maxHeight: "60dvh", overflowY: "auto" }}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={22} className="animate-spin text-muted" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-faint">
            {mode === "followers" ? "No followers yet." : "Not following anyone yet."}
          </p>
        ) : (
          rows.map((r) => {
            const name = r.display_name ?? r.username ?? "User";
            const isSelf = r.id === currentUserId;
            return (
              <div key={r.id} className="flex items-center gap-3 py-2.5">
                <Link href={r.username ? `/u/${r.username}` : "#"} onClick={onClose}>
                  <Avatar name={name} hue={r.avatar_hue ?? 280} size={44} />
                </Link>
                <Link href={r.username ? `/u/${r.username}` : "#"} onClick={onClose} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  {r.username && <p className="truncate text-xs text-muted">@{r.username}</p>}
                </Link>
                {!isSelf && currentUserId && (
                  <div className="w-24">
                    <FollowButton
                      currentUserId={currentUserId}
                      targetUserId={r.id}
                      targetUsername={r.username}
                      initialFollowing={followingSet.has(r.id)}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </BottomSheet>
  );
}
