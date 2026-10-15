"use client";

import { Check, LayoutGrid, Users } from "lucide-react";
import { FollowButton } from "@/components/profile/FollowButton";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { DisplayName } from "@/components/ui/DisplayName";
import { ShareNodesIcon } from "@/components/ui/ShareIcon";
import { CardPlate, PlateFoot, Well } from "@/components/profile/CardPlate";
import { pronounLabel } from "@/lib/profile";
import { prettyUrl, safeHref, type ProfileLink } from "@/lib/profile-card";
import type { ProfileCardData } from "@/components/profile/ProfileCard";

/** Whether the person looking follows the card's owner. Null on your own card, or signed out. */
export type Follow = { following: boolean; requested: boolean } | null;

export type FaceProps = {
  data: ProfileCardData;
  links: ProfileLink[];
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
 * The photograph is set into the plate rather than bled to its edge — a
 * squircle in a well, with the plate showing all the way round. It is the
 * one treatment that holds at every photo shape: a portrait, a square and a
 * logo all look deliberate inside a frame, where a photo running to the
 * card's own corners only looks right for one of them.
 *
 * Sharing sits under the Follow button, which is where the things you can
 * do about a person are. It used to float over the photograph, and a card
 * exists to be screenshotted — the button ended up in every screenshot of
 * it, reading as browser furniture rather than as part of the card.
 */
export function CardFront({ data, links, loading, follow, onPhoto, onShare, shared, onFlip }: FaceProps) {
  return (
    <CardPlate>
      <div className="relative flex min-h-0 flex-1 p-2.5">
        <Well className="min-h-0 flex-1">
          <Photo data={data} onPhoto={onPhoto} />
        </Well>
      </div>

      <div className="relative flex flex-col gap-2.5 px-4 pb-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="flex min-w-0 text-[25px] font-extrabold leading-none tracking-tight">
              <DisplayName name={data.name} profile={data.cosmetics} className="min-w-0 truncate" />
            </h2>
            {data.verified && <VerifiedStar className="h-[18px] w-[18px] shrink-0" />}
          </div>
          <HandleLine data={data} />
        </div>

        {data.bio && <p className="line-clamp-3 text-[13.5px] leading-relaxed text-white/70">{data.bio}</p>}
        {data.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.tags.map((t) => (
              <span
                key={t}
                className="rounded-md px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-wide text-white/70"
                style={{ background: "rgba(255,255,255,0.05)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5" aria-label={`${data.stats.followers} followers`}>
            <Users size={15} className="text-white/45" aria-hidden />
            <b className="font-extrabold tabular-nums">{data.stats.followers.toLocaleString()}</b>
          </span>
          <span className="flex items-center gap-1.5" aria-label={`${data.stats.posts} posts`}>
            <LayoutGrid size={15} className="text-white/45" aria-hidden />
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

        {/* Under the Follow button, on the same edge. The glyph alone —
            the word beside it said nothing the icon had not already, and
            a card is a thing you look at rather than read. */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onShare}
            aria-label={shared ? "Link copied" : "Share this card"}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/55 transition hover:bg-white/[0.06] hover:text-white/85 active:scale-90"
          >
            {shared ? <Check size={17} strokeWidth={2.6} /> : <ShareNodesIcon size={17} />}
          </button>
        </div>

        {!loading && <Links links={links} />}
      </div>

      <PlateFoot side="front" onFlip={onFlip} />
    </CardPlate>
  );
}

/** Handle and pronouns on one line, the way the profile header sets them. */
function HandleLine({ data }: { data: ProfileCardData }) {
  const pronouns = pronounLabel(data.pronouns);
  if (!data.username && !pronouns) return null;
  return (
    <p className="mt-2 flex items-center gap-1.5 font-mono text-[12px] text-white/45">
      {data.username && <span>@{data.username}</span>}
      {data.username && pronouns && <span aria-hidden className="text-white/25">·</span>}
      {pronouns && <span>{pronouns}</span>}
    </p>
  );
}

/** Their photo, or their colour and initial when there is none. */
function Photo({ data, onPhoto }: { data: ProfileCardData; onPhoto: () => void }) {
  // It fills whatever the card has spare and gives height back when the
  // screen is short. The floor is low enough to survive a small phone and
  // high enough that the photograph is still the subject.
  const shape = "w-full flex-1 [min-height:170px]";
  if (!data.avatarUrl) {
    return (
      <div
        aria-hidden
        className={`flex items-center justify-center text-[110px] font-extrabold text-white/90 ${shape}`}
        style={{
          background: `linear-gradient(140deg, hsl(${data.hue} 70% 46%), hsl(${(data.hue + 50) % 360} 65% 30%))`,
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

/** Link buttons — the reason the card exists rather than the header. */
function Links({ links }: { links: ProfileLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="flex w-full flex-col gap-2 pt-0.5">
      {links.map((l) => {
        const href = safeHref(l.url);
        if (!href) return null;
        return (
          <a
            key={l.id}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="flex w-full flex-col items-center rounded-xl px-4 py-2.5 text-center transition active:scale-[0.99] hover:bg-white/[0.08]"
            style={{ background: "rgba(255,255,255,0.05)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}
          >
            <span className="text-sm font-bold text-white">{l.label}</span>
            <span className="mt-0.5 truncate text-[10px] text-white/45">{prettyUrl(href)}</span>
          </a>
        );
      })}
    </div>
  );
}
