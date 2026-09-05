import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hueFromId } from "@/lib/profile";
import { ProfileCardPage } from "@/components/profile/ProfileCardPage";

/**
 * The profile card, on the URL its own QR code implies.
 *
 * The card is a full-screen surface with three panes, a QR code and a Share
 * button — a thing that exists specifically to be sent to someone — and the
 * only way to open it was a long-press on an avatar. Sharing it shared a link
 * to somewhere else.
 */
export const dynamic = "force-dynamic";

async function fetchStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const [postsRes, shotsRes, followersRes, followingRes] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("shots").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  // "Posts" includes Shots, matching the profile header.
  return {
    posts: (postsRes.count ?? 0) + (shotsRes.count ?? 0),
    followers: followersRes.count ?? 0,
    following: followingRes.count ?? 0,
  };
}

export default async function ProfileCardRoute({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username.toLowerCase())
    .eq("profile_completed", true)
    .maybeSingle();
  if (!profile) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const stats = await fetchStats(supabase, profile.id as string);

  return (
    <ProfileCardPage
      data={{
        accentId: (profile.accent_id as string) ?? null,
        userId: profile.id as string,
        name: (profile.display_name as string) ?? (profile.username as string) ?? "User",
        username: (profile.username as string) ?? null,
        bio: (profile.bio as string) ?? null,
        tags: (profile.profile_tags as string[]) ?? [],
        hue: (profile.avatar_hue as number) ?? hueFromId(profile.id as string),
        avatarUrl: (profile.avatar_url as string) ?? null,
        verified: (profile.is_verified as boolean) ?? false,
        stats,
        isOwn: user?.id === profile.id,
      }}
    />
  );
}
