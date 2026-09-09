import type { ReactNode } from "react";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import { accentVars } from "@/lib/profile-accent";
import { BannerEditMenu } from "@/components/profile/BannerEditMenu";
import { FollowStats } from "@/components/profile/FollowStats";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { HyperStar } from "@/components/ui/HyperStar";
import { MutualHyperBadge } from "@/components/ui/MutualHyperBadge";
import { AnthemChip } from "@/components/profile/AnthemChip";
import {
  ProfileStatusBubble,
  type ProfileNote,
} from "@/components/profile/ProfileStatusBubble";

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
  isHyper = false,
  isMutualHyper = false,
  anthemEditable = false,
  anthem = null,
  note = null,
  noteEditable = false,
  accentId,
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
  isHyper?: boolean;
  isMutualHyper?: boolean;
  anthemEditable?: boolean;
  anthem?: unknown;
  note?: ProfileNote;
  noteEditable?: boolean;
  /** Profile owner's accent. Tints THIS subtree only. */
  accentId?: string | null;
}) {
  return (
    // Redefining the two accent variables here re-tints every bg-accent /
    // text-accent below it and nothing else — the bottom nav and feed are not
    // descendants, so the viewer's own chrome stays Hypefy lime.
    <div style={accentVars(accentId)}>
      {/* Relative wrapper, not the banner itself: ProfileBanner carries the
          caller's margins, and the pencil has to sit inside those. */}
      <div className="relative mx-2 mt-2">
        <ProfileBanner
          bannerId={bannerId}
          bannerUrl={bannerUrl}
          className="rounded-card"
        />
        {currentUserId === userId && <BannerEditMenu userId={userId} />}
        <ProfileStatusBubble
          note={note}
          editable={noteEditable}
          me={{ name, hue, avatarUrl: avatarUrl ?? null }}
          ownerId={userId}
          viewerId={currentUserId}
        />
      </div>

      <div className="px-4">
        {/* Avatar + stats */}
        <div className="flex items-end gap-4">
          <div className="relative -mt-11 inline-block rounded-[26px] shadow-[0_8px_20px_rgba(0,0,0,0.45)]">
            <ProfileAvatar
              name={name}
              hue={hue}
              avatarUrl={avatarUrl}
              hasActiveShow={hasActiveShow}
              showId={entryShowId}
              card={{
                accentId,
                userId,
                name,
                username,
                bio,
                tags,
                hue,
                avatarUrl,
                verified,
                stats,
                isOwn: currentUserId === userId,
              }}
            />
          </div>
          <FollowStats
            username={username}
            posts={stats.posts}
            followers={stats.followers}
            following={stats.following}
          />
        </div>

        {/* Identity */}
        <div className="mt-3">
          <span className="flex items-center gap-1 text-base font-bold leading-tight">
            {name}
            {verified && (
              <VerifiedStar className="h-4 w-4 shrink-0 text-verified" />
            )}
            {isHyper && <HyperStar className="h-4 w-4 shrink-0" />}
            {isMutualHyper && <MutualHyperBadge />}
          </span>
          {username && <p className="mt-0.5 text-sm text-muted">@{username}</p>}
          <AnthemChip
            anthem={anthem}
            editable={anthemEditable}
            userId={anthemEditable ? userId : undefined}
          />
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
    </div>
  );
}
