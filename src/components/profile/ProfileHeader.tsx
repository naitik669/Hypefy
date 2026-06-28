import type { ReactNode } from "react";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import { FollowStats } from "@/components/profile/FollowStats";
import { VerifiedStar } from "@/components/ui/VerifiedStar";

/**
 * Profile hero — banner, the squircle avatar overlapping its bottom-left
 * corner, post/follower/following counts beside it, identity, and tags.
 * Shared by the own-profile and public-profile pages so they can't drift.
 */
export function ProfileHeader({
  name,
  username,
  bio,
  tags,
  hue,
  avatarUrl,
  bannerId,
  bannerUrl,
  hasActiveShow,
  entryShowId,
  userId,
  currentUserId,
  stats,
  actions,
  verified = false,
}: {
  name: string;
  username: string | null;
  bio: string | null;
  tags: string[];
  hue: number;
  avatarUrl: string | null | undefined;
  bannerId: string;
  bannerUrl: string | null | undefined;
  hasActiveShow: boolean;
  entryShowId: string | null;
  userId: string;
  currentUserId: string | null;
  stats: { posts: number; followers: number; following: number };
  actions?: ReactNode;
  verified?: boolean;
}) {
  return (
    <>
      <ProfileBanner bannerId={bannerId} bannerUrl={bannerUrl} className="mx-3 mt-3 h-32 rounded-card" />

      <div className="px-4">
        {/* Avatar + stats */}
        <div className="flex items-end gap-4">
          <div className="-mt-11 inline-block rounded-[26px] shadow-[0_8px_20px_rgba(0,0,0,0.45)]">
            <ProfileAvatar
              name={name}
              hue={hue}
              avatarUrl={avatarUrl}
              hasActiveShow={hasActiveShow}
              showId={entryShowId}
            />
          </div>
          <FollowStats
            userId={userId}
            currentUserId={currentUserId}
            posts={stats.posts}
            followers={stats.followers}
            following={stats.following}
          />
        </div>

        {/* Identity */}
        <div className="mt-3">
          <span className="flex items-center gap-1 text-base font-bold leading-tight">
            {name}
            {verified && <VerifiedStar className="h-4 w-4 shrink-0 text-verified" />}
          </span>
          {username && <p className="mt-0.5 text-sm text-muted">@{username}</p>}
          {bio && <p className="mt-1.5 text-sm leading-snug">{bio}</p>}
        </div>

        {/* Profile tags */}
        {tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {actions && <div className="mt-3 flex gap-2">{actions}</div>}
      </div>
    </>
  );
}
