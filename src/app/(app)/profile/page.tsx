import Link from "next/link";
import { Settings, BarChart3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, hueFromId } from "@/lib/profile";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { ProfileShowcase } from "@/components/profile/ProfileShowcase";

async function fetchStats(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const [postsRes, shotsRes, followersRes, followingRes] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("shots").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  return {
    // "Posts" count includes Shots (both are content the user posted).
    posts: (postsRes.count ?? 0) + (shotsRes.count ?? 0),
    followers: followersRes.count ?? 0,
    following: followingRes.count ?? 0,
  };
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const nowIso = new Date().toISOString();
  const [profile, stats, activeShowsRes] = await Promise.all([
    getProfile(supabase),
    fetchStats(supabase, user.id),
    // Active Shows for the avatar ring (oldest = entry)
    supabase
      .from("shows")
      .select("id")
      .eq("user_id", user.id)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: true })
      .limit(1),
  ]);

  const entryShowId = activeShowsRes.data?.[0]?.id ?? null;

  const name = profile?.displayName || "Hypefy User";
  const bio = profile?.bio ?? null;
  const profileTags = profile?.profileTags ?? [];
  const hue = profile?.avatarHue ?? hueFromId(user.id);
  const bannerId = profile?.bannerId ?? "lime-pulse";

  return (
    <>
      <ProfileHeader
        name={name}
        username={profile?.username ?? null}
        bio={bio}
        tags={profileTags}
        hue={hue}
        avatarUrl={profile?.avatarUrl}
        bannerId={bannerId}
        bannerUrl={profile?.bannerUrl}
        hasActiveShow={!!entryShowId}
        entryShowId={entryShowId}
        userId={user.id}
        currentUserId={user.id}
        stats={stats}
        verified={profile?.isVerified ?? false}
        actions={
          <>
            <Link
              href="/settings/profile"
              className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border bg-elevated text-sm font-semibold text-foreground transition-colors hover:bg-elevated/70 active:scale-[0.99]"
            >
              Edit profile
            </Link>
            <Link
              href="/profile/insights"
              aria-label="Insights"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-elevated text-foreground transition-colors hover:bg-elevated/70 active:scale-[0.99]"
            >
              <BarChart3 size={18} />
            </Link>
            <Link
              href="/settings"
              aria-label="Settings"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-elevated text-foreground transition-colors hover:bg-elevated/70 active:scale-[0.99]"
            >
              <Settings size={18} />
            </Link>
          </>
        }
      />

      {/* Pinned Shots/Shows highlights */}
      <ProfileShowcase userId={user.id} />

      {/* Tabs: Posts | Shots | Saved */}
      <ProfileTabs userId={user.id} />
    </>
  );
}
