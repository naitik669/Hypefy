import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/Avatar";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import { PublicProfileTabs } from "@/components/profile/PublicProfileTabs";
import { FollowButton } from "@/components/profile/FollowButton";
import { MessageButton } from "@/components/profile/MessageButton";
import { FollowStats } from "@/components/profile/FollowStats";
import { SignOutButton } from "@/components/SignOutButton";
import { hueFromId } from "@/lib/profile";

async function fetchStats(supabase: any, userId: string) {
  const [postsRes, followersRes, followingRes] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  return { posts: postsRes.count ?? 0, followers: followersRes.count ?? 0, following: followingRes.count ?? 0 };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  // Look up the target profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username.toLowerCase())
    .eq("profile_completed", true)
    .maybeSingle();

  if (!profile) notFound();

  const isOwn = currentUser?.id === profile.id;
  const stats = await fetchStats(supabase, profile.id);

  // Check if current user follows this profile
  let isFollowing = false;
  if (currentUser && !isOwn) {
    const { data: followRow } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", currentUser.id)
      .eq("following_id", profile.id)
      .maybeSingle();
    isFollowing = !!followRow;
  }

  const name = profile.display_name ?? profile.username ?? "User";
  const hue = profile.avatar_hue ?? hueFromId(profile.id);
  const bannerId = profile.banner_id ?? "lime-pulse";
  const tags: string[] = profile.profile_tags ?? [];

  // Showcase shots
  const { data: showcaseShots } = await supabase
    .from("shots")
    .select("id, media_url, caption")
    .eq("user_id", profile.id)
    .eq("in_showcase", true)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <>
      <ProfileBanner bannerId={bannerId} bannerUrl={profile.banner_url} className="h-32" />

      <div className="px-4">
        {/* Avatar + stats */}
        <div className="flex items-end gap-4">
          <div className="-mt-11">
            <Avatar name={name} hue={hue} size={84} src={profile.avatar_url ?? undefined} className="rounded-[26px] ring-4 ring-background" />
          </div>
          <FollowStats
            userId={profile.id}
            currentUserId={currentUser?.id ?? null}
            posts={stats.posts}
            followers={stats.followers}
            following={stats.following}
          />
        </div>

        {/* Identity */}
        <div className="mt-3">
          <span className="text-base font-bold">{name}</span>
          <p className="mt-0.5 text-sm text-muted">@{profile.username}</p>
          {profile.bio && <p className="mt-1.5 text-sm leading-snug">{profile.bio}</p>}
        </div>

        {/* Profile tags */}
        {tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {tags.map((tag: string) => (
              <span key={tag} className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Showcase */}
        {(showcaseShots ?? []).length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Showcase</p>
            <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1">
              {(showcaseShots ?? []).map((shot: any) => (
                <Link key={shot.id} href="/shots" className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                  <div className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-accent ring-offset-2 ring-offset-background">
                    <video src={shot.media_url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                  </div>
                  <span className="max-w-full truncate text-center text-[10px] text-muted">{shot.caption ?? "Shot"}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-3 flex gap-2">
          {isOwn ? (
            <>
              <Link href="/setup-profile" className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border bg-surface text-sm font-semibold transition-colors hover:bg-elevated">
                Edit profile
              </Link>
              <SignOutButton />
            </>
          ) : currentUser ? (
            <>
              <FollowButton
                currentUserId={currentUser.id}
                targetUserId={profile.id}
                targetUsername={profile.username}
                initialFollowing={isFollowing}
              />
              <MessageButton currentUserId={currentUser.id} targetUserId={profile.id} />
            </>
          ) : (
            <Link href="/signin" className="flex h-10 flex-1 items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-ink">
              Sign in to follow
            </Link>
          )}
        </div>
      </div>

      {/* Tabs: Posts | Shots (no Saved for others) */}
      <PublicProfileTabs
        userId={profile.id}
        isOwn={isOwn}
        currentUserId={currentUser?.id ?? null}
      />
    </>
  );
}
