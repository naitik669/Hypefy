"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PostViewerModal } from "@/components/profile/PostViewerModal";
import type { FeedPost } from "@/components/feed/FeedCard";

/** /p/[postId] page — same swipeable viewer as the profile grid, just routed to directly. */
export function PostDetailViewer({
  posts,
  startIdx,
  currentUserId,
}: {
  posts: FeedPost[];
  startIdx: number;
  currentUserId: string;
}) {
  const router = useRouter();

  // Count a view for the opened post (the RPC ignores the author's own views).
  useEffect(() => {
    const id = posts[startIdx]?.id;
    if (!id) return;
    createClient().rpc("increment_post_view", { p_post_id: id }).then(() => {});
  }, [posts, startIdx]);

  return (
    <PostViewerModal
      posts={posts}
      startIdx={startIdx}
      currentUserId={currentUserId}
      onClose={() => router.back()}
    />
  );
}
