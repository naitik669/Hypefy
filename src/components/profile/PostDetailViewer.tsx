"use client";

import { useRouter } from "next/navigation";
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
  return (
    <PostViewerModal
      posts={posts}
      startIdx={startIdx}
      currentUserId={currentUserId}
      onClose={() => router.back()}
    />
  );
}
