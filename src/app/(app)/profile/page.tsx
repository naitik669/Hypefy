import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, hueFromId, bannerGradient } from "@/lib/profile";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { SignOutButton } from "@/components/SignOutButton";
import { formatCount } from "@/lib/mock";

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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <span className="text-lg font-bold tabular-nums leading-none">{formatCount(value)}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await getProfile(supabase);
  const stats = await fetchStats(supabase, user.id);

  const name = profile?.displayName || "Hypefy User";
  const handle = profile?.username ? `@${profile.username}` : null;
  const bio = profile?.bio ?? null;
  const profileTags = profile?.profileTags ?? [];
  const hue = profile?.avatarHue ?? hueFromId(user.id);
  const bannerId = profile?.bannerId ?? "lime-pulse";

  return (
    <>
      {/* Banner */}
      <ProfileBanner bannerId={bannerId} className="h-32" />

      <div className="px-4">
        {/* Avatar + stats row */}
        <div className="flex items-end gap-4">
          <div className="-mt-11">
            <Avatar name={name} hue={hue} size={84} className="rounded-[26px] ring-4 ring-background" />
          </div>
          <div className="flex flex-1 pb-1">
            <Stat label="Posts" value={stats.posts} />
            <Stat label="Followers" value={stats.followers} />
            <Stat label="Following" value={stats.following} />
          </div>
        </div>

        {/* Identity */}
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-base font-bold leading-tight">{name}</span>
            {/* Verified badge — can be added when backend supports it */}
          </div>
          {handle && <p className="mt-0.5 text-sm text-muted">{handle}</p>}
          {bio && <p className="mt-1.5 text-sm leading-snug">{bio}</p>}
        </div>

        {/* Profile tags (replaces vibe) */}
        {profileTags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {profileTags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-3 flex gap-2">
          <Link
            href="/setup-profile"
            className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border bg-surface text-sm font-semibold text-foreground transition-colors hover:bg-elevated active:scale-[0.99]"
          >
            Edit profile
          </Link>
          <SignOutButton />
        </div>
      </div>

      {/* Tabs: Posts | Shots | Saved — no Rooms */}
      <ProfileTabs userId={user.id} />
    </>
  );
}
