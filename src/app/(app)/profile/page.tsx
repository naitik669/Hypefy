import Link from "next/link";
import { Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, hueFromId } from "@/lib/profile";
import { AvatarImg } from "@/components/ui/AvatarImg";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { FollowStats } from "@/components/profile/FollowStats";

async function fetchStats(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const [postsRes, followersRes, followingRes] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  return {
    posts: postsRes.count ?? 0,
    followers: followersRes.count ?? 0,
    following: followingRes.count ?? 0,
  };
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [profile, stats, showcaseShotsRes, showcaseShowsRes] = await Promise.all([
    getProfile(supabase),
    fetchStats(supabase, user.id),
    // Showcase shots (videos) — no expires_at filter
    supabase
      .from("shots")
      .select("id, media_url, caption")
      .eq("user_id", user.id)
      .eq("in_showcase", true)
      .order("created_at", { ascending: false })
      .limit(20),
    // Showcase shows (stories) — persisted, no expiry filter
    supabase
      .from("shows")
      .select("id, media_url, caption")
      .eq("user_id", user.id)
      .eq("is_showcase", true)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const showcaseShots = showcaseShotsRes.data ?? [];
  // Graceful fallback: is_showcase column may not exist yet
  const showcaseShows = showcaseShowsRes.error ? [] : (showcaseShowsRes.data ?? []);

  const name = profile?.displayName || "Hypefy User";
  const handle = profile?.username ? `@${profile.username}` : null;
  const bio = profile?.bio ?? null;
  const profileTags = profile?.profileTags ?? [];
  const hue = profile?.avatarHue ?? hueFromId(user.id);
  const bannerId = profile?.bannerId ?? "lime-pulse";

  return (
    <>
      {/* Banner */}
      <ProfileBanner bannerId={bannerId} bannerUrl={profile?.bannerUrl} className="h-32" />

      <div className="px-4">
        {/* Avatar + stats */}
        <div className="flex items-end gap-4">
          <div className="-mt-11">
            <AvatarImg url={profile?.avatarUrl} name={name} hue={hue} size={84} className="rounded-[26px] ring-4 ring-background" />
          </div>
          <FollowStats
            userId={user.id}
            currentUserId={user.id}
            posts={stats.posts}
            followers={stats.followers}
            following={stats.following}
          />
        </div>

        {/* Identity */}
        <div className="mt-3">
          <span className="text-base font-bold leading-tight">{name}</span>
          {handle && <p className="mt-0.5 text-sm text-muted">{handle}</p>}
          {bio && <p className="mt-1.5 text-sm leading-snug">{bio}</p>}
        </div>

        {/* Profile tags */}
        {profileTags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {profileTags.map((tag) => (
              <span key={tag} className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Showcase row — shows + shots pinned to profile */}
        {(showcaseShows.length > 0 || showcaseShots.length > 0) && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-muted tracking-wide uppercase">Showcase</p>
            <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1">
              {/* Pinned Shows (stories) */}
              {showcaseShows.map((show: any) => (
                <Link
                  key={show.id}
                  href={`/shows/${show.id}`}
                  className="flex w-16 shrink-0 flex-col items-center gap-1.5"
                >
                  <div className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-accent ring-offset-2 ring-offset-background">
                    {show.media_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={show.media_url} alt={show.caption ?? "Show"} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-accent/50 to-[hsl(280deg_70%_30%)]" />
                    )}
                  </div>
                  <span className="max-w-full truncate text-center text-[10px] text-muted leading-tight">
                    {show.caption ?? "Show"}
                  </span>
                </Link>
              ))}

              {/* Pinned Shots (videos) */}
              {showcaseShots.map((shot) => (
                <Link
                  key={shot.id}
                  href="/shots"
                  className="flex w-16 shrink-0 flex-col items-center gap-1.5"
                >
                  <div className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-border ring-offset-2 ring-offset-background">
                    <video src={shot.media_url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                  </div>
                  <span className="max-w-full truncate text-center text-[10px] text-muted leading-tight">
                    {shot.caption ?? "Shot"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-3 flex gap-2">
          <Link
            href="/settings/profile"
            className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border bg-surface text-sm font-semibold text-foreground transition-colors hover:bg-elevated active:scale-[0.99]"
          >
            Edit profile
          </Link>
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-foreground transition-colors hover:bg-elevated active:scale-[0.99]"
          >
            <Settings size={18} />
          </Link>
        </div>
      </div>

      {/* Tabs: Posts | Shots | Saved */}
      <ProfileTabs userId={user.id} />
    </>
  );
}
