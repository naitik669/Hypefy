"use client";

import { LayoutGrid, Users } from "lucide-react";
import { FollowButton } from "@/components/profile/FollowButton";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { DisplayName } from "@/components/ui/DisplayName";
import { ShareIcon } from "@/components/ui/ShareIcon";
import { FlipStrip } from "@/components/profile/CardFlip";
import { prettyUrl, safeHref, type ProfileLink } from "@/lib/profile-card";
import type { ProfileCardData } from "@/components/profile/ProfileCard";

/** Whether the person looking follows the card's owner. Null on your own card, or signed out. */
export type Follow = { following: boolean; requested: boolean } | null;

export type FaceProps = {
  data: ProfileCardData;
  links: ProfileLink[];
  /** The theme, as a CSS background. */
  background: string;
  loading: boolean;
  follow: Follow;
  onPhoto: () => void;
  onShare: () => void;
  /** Whether the share button is showing its "copied" state. */
  shared: boolean;
  onFlip: () => void;
};

/**
 * The front of the card: the person.
 *
 * The photo sits in a frame with the card showing round it, which is the
 * one layout of the seven that held up at every photo shape — a portrait
 * and a square and a logo all look deliberate inside a frame, where a photo
 * bled to the card's own edge only looked right for one of them.
 *
 * Everything the card can do is on the card. Sharing is a button over the
 * photo, flipping is the strip along the foot, and the photo opens itself.
 * They used to be a row of grey pills floating underneath, which read as
 * browser chrome rather than as part of the thing being shared — and they
 * were in every screenshot of it.
 */
export function CardFront({
  data,
  links,
  background,
  loading,
  follow,
  onPhoto,
  onShare,
  shared,
  onFlip,
}: FaceProps) {
  return (
    <div
      className="overflow-hidden rounded-[28px] border border-white/10 p-2.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]"
      style={{ background }}
    >
      <div className="relative">
        <Photo data={data} onPhoto={onPhoto} />
        <button
          type="button"
          onClick={onShare}
          aria-label={shared ? "Link copied" : "Share this card"}
          className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md transition active:scale-90 hover:bg-black/65"
        >
          {shared ? (
            <span className="text-[10px] font-black uppercase tracking-tight">OK</span>
          ) : (
            <ShareIcon size={17} weight="bold" />
          )}
        </button>
      </div>

      <div className="flex flex-col gap-3 px-2 pb-1 pt-3.5">
        <Name data={data} />
        {data.bio && <p className="line-clamp-3 text-sm leading-relaxed text-white/70">{data.bio}</p>}
        {data.tags.length > 0 && <Tags tags={data.tags} />}
        <Counts data={data} follow={follow} />
        {!loading && <Links links={links} />}
        <FlipStrip side="front" onFlip={onFlip} />
      </div>
    </div>
  );
}

/* ── The pieces ──────────────────────────────────────────────────────────── */

/** Their photo, or their colour and initial when there is none. */
function Photo({ data, onPhoto }: { data: ProfileCardData; onPhoto: () => void }) {
  const shape = "aspect-[1/1.05] w-full overflow-hidden rounded-[20px]";
  if (!data.avatarUrl) {
    return (
      <div
        aria-hidden
        className={`flex items-center justify-center text-[110px] font-extrabold text-white/90 ${shape}`}
        style={{
          background: `linear-gradient(140deg, hsl(${data.hue} 75% 52%), hsl(${(data.hue + 50) % 360} 70% 38%))`,
        }}
      >
        {data.name.trim()[0]?.toUpperCase() ?? "?"}
      </div>
    );
  }
  return (
    <button type="button" onClick={onPhoto} aria-label="View photo" className={`block ${shape}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.avatarUrl} alt="" className="h-full w-full object-cover" />
    </button>
  );
}

export function Name({ data, size = "lg" }: { data: ProfileCardData; size?: "lg" | "sm" }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <h2
          className={`flex min-w-0 font-extrabold leading-tight tracking-tight ${
            size === "lg" ? "text-[26px]" : "text-xl"
          }`}
        >
          <DisplayName name={data.name} profile={data.cosmetics} className="min-w-0 truncate" />
        </h2>
        {data.verified && (
          <VerifiedStar className={`shrink-0 ${size === "lg" ? "h-5 w-5" : "h-[17px] w-[17px]"}`} />
        )}
      </div>
      {data.username && <p className="text-sm text-white/55">@{data.username}</p>}
    </div>
  );
}

/** Followers and posts with their icons, and Follow at the end on someone else's card. */
function Counts({ data, follow }: { data: ProfileCardData; follow: Follow }) {
  return (
    <div className="flex w-full items-center gap-4 text-sm">
      <span className="flex items-center gap-1.5" aria-label={`${data.stats.followers} followers`}>
        <Users size={15} className="text-white/50" aria-hidden />
        <b className="font-extrabold tabular-nums">{data.stats.followers.toLocaleString()}</b>
      </span>
      <span className="flex items-center gap-1.5" aria-label={`${data.stats.posts} posts`}>
        <LayoutGrid size={15} className="text-white/50" aria-hidden />
        <b className="font-extrabold tabular-nums">{data.stats.posts.toLocaleString()}</b>
      </span>
      {follow && (
        <FollowButton
          targetUserId={data.userId}
          targetUsername={data.username}
          initialFollowing={follow.following}
          initialRequested={follow.requested}
          variant="inline"
          followLabel="Follow +"
          className="ml-auto h-9 px-5 text-[13px]"
        />
      )}
    </div>
  );
}

function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="rounded-pill border border-white/15 bg-black/25 px-2.5 py-1 text-[11px] font-semibold text-white/85"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

/** Link buttons — the reason the card exists rather than the header. */
function Links({ links }: { links: ProfileLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="flex w-full flex-col gap-2">
      {links.map((l) => {
        const href = safeHref(l.url);
        if (!href) return null;
        return (
          <a
            key={l.id}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="flex w-full flex-col items-center rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-center transition active:scale-[0.99] hover:bg-black/45"
          >
            <span className="text-sm font-bold text-white">{l.label}</span>
            <span className="mt-0.5 truncate text-[10px] text-white/50">{prettyUrl(href)}</span>
          </a>
        );
      })}
    </div>
  );
}
