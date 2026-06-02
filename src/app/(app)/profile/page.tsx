import Link from "next/link";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, hueFromId } from "@/lib/profile";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { SignOutButton } from "@/components/SignOutButton";
import { currentUser, formatCount } from "@/lib/mock";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-1 flex-col items-center">
      <span className="text-lg font-bold tabular-nums">{formatCount(value)}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const profile = await getProfile(supabase);

  // Real profile values with mock fallback for fields we don't store yet (stats).
  const name = profile?.displayName || currentUser.name;
  const handle = profile?.username ? `@${profile.username}` : currentUser.handle;
  const bio = profile?.bio ?? currentUser.bio;
  const vibe = profile?.currentVibe ?? currentUser.vibe;
  const hue = profile?.avatarHue ?? (profile ? hueFromId(profile.id) : currentUser.hue);
  const bannerId = profile?.bannerId ?? "lime-pulse";
  const stats = currentUser.stats; // TODO: real counts when posts/rooms exist

  return (
    <>
      {/* Banner */}
      <ProfileBanner bannerId={bannerId} className="h-32" />

      <div className="px-4">
        {/* Avatar (overlapping) + stats */}
        <div className="flex items-end gap-4">
          <div className="-mt-10">
            <Avatar
              name={name}
              hue={hue}
              size={84}
              className="rounded-[26px] ring-4 ring-background"
            />
          </div>
          <div className="flex flex-1 pb-1">
            <Stat label="Posts" value={stats.posts} />
            <Stat label="Hypes" value={stats.hypes} />
            <Stat label="Rooms" value={stats.rooms} />
          </div>
        </div>

        {/* Identity */}
        <div className="mt-3">
          <div className="flex items-center gap-1">
            <span className="font-bold">{name}</span>
            {currentUser.verified && (
              <VerifiedStar className="h-6 w-6 text-verified" />
            )}
          </div>
          <p className="text-sm text-muted">{handle}</p>
          {bio && <p className="mt-1.5 text-sm leading-snug">{bio}</p>}
        </div>

        {/* Vibe card */}
        {vibe && (
          <div className="mt-3 flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-2.5">
            <Sparkles size={16} className="text-accent" />
            <span className="text-sm">
              <span className="text-muted">Current vibe:</span>{" "}
              <span className="font-semibold">{vibe}</span>
            </span>
          </div>
        )}

        {/* Interests */}
        {profile?.interests && profile.interests.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {profile.interests.map((i) => (
              <span
                key={i}
                className="rounded-pill bg-elevated px-2.5 py-1 text-xs text-muted"
              >
                {i}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          <Link
            href="/setup-profile"
            className="flex h-10 flex-1 items-center justify-center rounded-pill border border-border text-sm font-semibold transition-colors hover:bg-white/5"
          >
            Edit profile
          </Link>
          <SignOutButton />
        </div>
      </div>

      <ProfileTabs />
    </>
  );
}
