import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FeedCard } from "@/components/feed/FeedCard";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: raw } = await supabase
    .from("posts")
    .select("*, profiles(id, display_name, username, avatar_hue, profile_tags)")
    .eq("id", postId)
    .maybeSingle();

  if (!raw) notFound();

  const post = {
    ...raw,
    profiles: Array.isArray(raw.profiles) ? raw.profiles[0] ?? null : raw.profiles,
  };

  // Check if current user has hyped / saved this post
  const uid = user?.id ?? "";
  const [hypedRes, savedRes] = uid
    ? await Promise.all([
        supabase.from("hypes").select("id").eq("user_id", uid).eq("target_type", "post").eq("target_id", postId).maybeSingle(),
        supabase.from("saved_posts").select("id").eq("user_id", uid).eq("post_id", postId).maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  return (
    <>
      <PageHeader title="Post" showBack />
      <FeedCard
        post={{
          ...post,
          initialHyped: !!hypedRes.data,
          initialSaved: !!savedRes.data,
        }}
        currentUserId={uid}
      />
    </>
  );
}
