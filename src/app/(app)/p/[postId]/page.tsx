import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FeedPost } from "@/components/feed/FeedCard";
import { PostDetailViewer } from "@/components/profile/PostDetailViewer";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id ?? "";

  const { data: target } = await supabase
    .from("posts")
    .select("id, user_id")
    .eq("id", postId)
    .maybeSingle();

  if (!target) notFound();

  const isOwn = uid === target.user_id;
  let canSeeAll = isOwn;
  if (!canSeeAll) {
    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("is_private")
      .eq("id", target.user_id)
      .maybeSingle();
    if (!ownerProfile?.is_private) {
      canSeeAll = true;
    } else if (uid) {
      const { data: followRow } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", uid)
        .eq("following_id", target.user_id)
        .maybeSingle();
      canSeeAll = !!followRow;
    }
  }

  // Scrollable in the same chronological order as the profile grid when the
  // viewer is allowed to see the rest of that profile's posts; otherwise
  // just this single post (private account, not a follower).
  const postsQuery = supabase
    .from("posts")
    .select("*, profiles(id, display_name, username, avatar_hue, avatar_url, profile_tags, is_verified)")
    .order("created_at", { ascending: false });
  const { data: rows } = canSeeAll
    ? await postsQuery.eq("user_id", target.user_id)
    : await postsQuery.eq("id", postId);

  const postIds = (rows ?? []).map((r) => r.id);
  const [hypesRes, savedRes] = uid && postIds.length
    ? await Promise.all([
        supabase.from("hypes").select("target_id").eq("user_id", uid).eq("target_type", "post").in("target_id", postIds),
        supabase.from("saved_posts").select("post_id").eq("user_id", uid).in("post_id", postIds),
      ])
    : [{ data: [] }, { data: [] }];
  const hypedSet = new Set((hypesRes.data ?? []).map((h: any) => h.target_id));
  const savedSet = new Set((savedRes.data ?? []).map((s: any) => s.post_id));

  const posts: FeedPost[] = (rows ?? []).map((raw: any) => ({
    ...raw,
    profiles: Array.isArray(raw.profiles) ? raw.profiles[0] ?? null : raw.profiles,
    initialHyped: hypedSet.has(raw.id),
    initialSaved: savedSet.has(raw.id),
  }));

  const startIdx = posts.findIndex((p) => p.id === postId);
  if (startIdx === -1) notFound();

  return <PostDetailViewer posts={posts} startIdx={startIdx} currentUserId={uid} />;
}
