"use client";

import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { LayoutGrid, Users } from "lucide-react";
import { FollowButton } from "@/components/profile/FollowButton";
import { AvatarImg } from "@/components/ui/AvatarImg";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { DisplayName } from "@/components/ui/DisplayName";
import { prettyUrl, safeHref, type CardLayout, type ProfileLink } from "@/lib/profile-card";
import type { ProfileCardData } from "@/components/profile/ProfileCard";

/** Whether the person looking follows the card's owner. Null on your own card, or signed out. */
export type Follow = { following: boolean; requested: boolean } | null;

type FaceProps = {
  data: ProfileCardData;
  links: ProfileLink[];
  /** The card theme: a banner gradient. */
  gradient: string;
  loading: boolean;
  follow: Follow;
  /** The public profile address, for the pass's QR. */
  url: string;
  onPhoto: () => void;
};

const SHELL = "animate-rise overflow-hidden rounded-[28px] border border-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]";

/**
 * The card itself — what a screenshot captures — in the layout its owner
 * chose in Edit card. Every layout carries the same things (photo, name and
 * seal, bio, tags, counts, Follow, links); they differ in how they are laid
 * out, not in what they say.
 */
export function CardFaceFor({ layout, ...props }: FaceProps & { layout: CardLayout }) {
  switch (layout) {
    case "framed":
      return <FramedFace {...props} />;
    case "poster":
      return <PosterFace {...props} />;
    case "pass":
      return <PassFace {...props} />;
    case "banner":
      return <BannerFace {...props} />;
    case "centred":
    case "aligned":
      return <ClassicFace {...props} centred={layout === "centred"} />;
    default:
      return <PhotoFace {...props} />;
  }
}

/* ── The layouts ─────────────────────────────────────────────────────────── */

/** Photo: the photo fills the top and melts into the card. The default. */
function PhotoFace({ data, links, gradient, loading, follow, onPhoto }: FaceProps) {
  // Faded out with a mask rather than a colour, so it melts into whichever
  // card theme is behind it.
  const melt = "[mask-image:linear-gradient(180deg,#000_58%,transparent)]";
  return (
    <div className={SHELL} style={{ background: gradient }}>
      <Photo data={data} onPhoto={onPhoto} className={`aspect-square w-full ${melt}`} initialSize={120} />
      <div className="relative -mt-16 flex flex-col gap-3 px-5 pb-5">
        <Name data={data} />
        <Body data={data} links={links} loading={loading} follow={follow} />
      </div>
    </div>
  );
}

/** Framed: the photo in a rounded frame, the card showing round it. */
function FramedFace({ data, links, gradient, loading, follow, onPhoto }: FaceProps) {
  return (
    <div className={`${SHELL} p-2.5`} style={{ background: gradient }}>
      <Photo data={data} onPhoto={onPhoto} className="aspect-[1/1.05] w-full rounded-[20px]" initialSize={110} />
      <div className="flex flex-col gap-3 px-2 pb-2 pt-3.5">
        <Name data={data} />
        <Body data={data} links={links} loading={loading} follow={follow} />
      </div>
    </div>
  );
}

/**
 * Poster: the photo is the whole card, the details on frosted glass at its
 * foot — the same way a photo page sits in the Spotlight deck. The links are
 * under the card, where they have room.
 */
function PosterFace({ data, links, loading, follow, onPhoto }: FaceProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className={`${SHELL} relative aspect-[3/4.2]`}>
        <Photo data={data} onPhoto={onPhoto} className="absolute inset-0 h-full w-full" initialSize={150} />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.35),transparent_25%,transparent_45%,rgba(0,0,0,.55))]"
        />
        <span className="pointer-events-none absolute left-4 top-3.5 text-[13px] font-extrabold">
          Hypefy<span className="text-accent">.</span>
        </span>
        <div className="absolute inset-x-2.5 bottom-2.5 flex flex-col gap-2.5 rounded-[20px] border border-white/10 bg-black/50 p-3.5 backdrop-blur-xl">
          <Name data={data} />
          {data.bio && <p className="line-clamp-2 text-sm leading-relaxed text-foreground/75">{data.bio}</p>}
          {data.tags.length > 0 && <Tags tags={data.tags} />}
          <Counts data={data} follow={follow} />
        </div>
      </div>
      {!loading && <Links links={links} />}
    </div>
  );
}

/**
 * Pass: a Hypefy membership pass. Photo and name at the top, a tear line,
 * and the QR as its stub — the card's QR on its face instead of a tap away.
 */
function PassFace({ data, links, gradient, loading, follow, url, onPhoto }: FaceProps) {
  const qr = useQr(url);
  return (
    <div className={`${SHELL} relative`} style={{ background: gradient }}>
      <div className="flex items-center gap-3 p-4">
        <Photo data={data} onPhoto={onPhoto} className="h-[108px] w-[88px] shrink-0 rounded-[18px]" initialSize={44} />
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-accent">Hypefy · Member</p>
          <Name data={data} size="sm" />
        </div>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <Body data={data} links={[]} loading follow={follow} />
      </div>

      {/* The tear line, with a notch cut out at each end. */}
      <div aria-hidden className="relative h-0">
        <div className="mx-4 border-t-2 border-dashed border-white/15" />
        <span className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-black" />
        <span className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full bg-black" />
      </div>

      <div className="flex items-center gap-3 p-4">
        {/* White with a quiet zone, or scanners will not read it. */}
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[10px] bg-white p-1">
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code to this profile" className="h-full w-full" />
          )}
        </span>
        <p className="min-w-0 font-mono text-[11px] leading-relaxed text-foreground/55">
          SCAN TO FOLLOW
          <br />
          <span className="block truncate text-foreground">{prettyUrl(url)}</span>
        </p>
      </div>

      {!loading && links.length > 0 && (
        <div className="px-4 pb-4">
          <Links links={links} />
        </div>
      )}
    </div>
  );
}

/** Banner: the card colour as a banner across the top, a big squircle photo breaking out of it. */
function BannerFace({ data, links, gradient, loading, follow, onPhoto }: FaceProps) {
  return (
    <div className={`${SHELL} bg-surface`}>
      <div aria-hidden className="h-[130px]" style={{ background: gradient }} />
      <div className="flex flex-col items-center gap-3 px-5 pb-5 text-center">
        <Photo
          data={data}
          onPhoto={onPhoto}
          className="-mt-14 h-28 w-28 rounded-[32px] border-4 border-surface shadow-[0_10px_24px_rgba(0,0,0,0.5)]"
          initialSize={48}
        />
        <Name data={data} centred />
        {data.bio && <p className="text-sm leading-relaxed text-foreground/75">{data.bio}</p>}
        {data.tags.length > 0 && <Tags tags={data.tags} centred />}
        <div className="flex w-full rounded-2xl border border-white/10 py-2.5">
          <BigCount n={data.stats.followers} label={data.stats.followers === 1 ? "follower" : "followers"} />
          <span aria-hidden className="w-px bg-white/10" />
          <BigCount n={data.stats.posts} label={data.stats.posts === 1 ? "post" : "posts"} />
        </div>
        {follow && (
          <FollowButton
            targetUserId={data.userId}
            targetUsername={data.username}
            initialFollowing={follow.following}
            initialRequested={follow.requested}
            followLabel="Follow +"
            className="w-full flex-none"
          />
        )}
        {!loading && <Links links={links} />}
      </div>
    </div>
  );
}

/** Centred and Aligned: the small squircle avatar with the name, as before. */
function ClassicFace({ data, links, gradient, loading, follow, centred }: FaceProps & { centred: boolean }) {
  return (
    <div className={SHELL} style={{ background: gradient }}>
      <div className={`flex flex-col gap-3 p-6 ${centred ? "items-center text-center" : "items-start text-left"}`}>
        <div className={`flex w-full gap-3 ${centred ? "flex-col items-center" : "items-center"}`}>
          <AvatarImg url={data.avatarUrl} name={data.name} hue={data.hue} size={centred ? 76 : 56} className="rounded-[22px]" />
          <Name data={data} centred={centred} size="sm" />
        </div>
        {data.bio && <p className="text-sm leading-relaxed text-foreground/80">{data.bio}</p>}
        {data.tags.length > 0 && <Tags tags={data.tags} centred={centred} />}
        <Counts data={data} follow={follow} centred={centred} />
        {!loading && <Links links={links} />}
      </div>
    </div>
  );
}

/* ── The pieces they share ───────────────────────────────────────────────── */

/** Their photo, or their colour and initial when there is none. Tapping a photo opens it. */
function Photo({
  data,
  onPhoto,
  className,
  initialSize,
}: {
  data: ProfileCardData;
  onPhoto: () => void;
  className: string;
  initialSize: number;
}) {
  if (!data.avatarUrl) {
    return (
      <div
        aria-hidden
        className={`flex items-center justify-center overflow-hidden font-extrabold text-white/90 ${className}`}
        style={{
          fontSize: initialSize,
          background: `linear-gradient(140deg, hsl(${data.hue} 75% 52%), hsl(${(data.hue + 50) % 360} 70% 38%))`,
        }}
      >
        {data.name.trim()[0]?.toUpperCase() ?? "?"}
      </div>
    );
  }
  return (
    <button type="button" onClick={onPhoto} aria-label="View photo" className={`block overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.avatarUrl} alt="" className="h-full w-full object-cover" />
    </button>
  );
}

function Name({ data, centred = false, size = "lg" }: { data: ProfileCardData; centred?: boolean; size?: "lg" | "sm" }) {
  return (
    <div className={`min-w-0 ${centred ? "text-center" : "text-left"}`}>
      <div className={`flex items-center gap-1.5 ${centred ? "justify-center" : ""}`}>
        <h2
          className={`flex min-w-0 font-extrabold leading-tight tracking-tight ${size === "lg" ? "text-[26px]" : "text-xl"}`}
        >
          <DisplayName name={data.name} profile={data.cosmetics} className="min-w-0 truncate" />
        </h2>
        {data.verified && (
          <VerifiedStar className={`shrink-0 text-verified ${size === "lg" ? "h-5 w-5" : "h-[17px] w-[17px]"}`} />
        )}
      </div>
      {data.username && <p className="text-sm text-foreground/55">@{data.username}</p>}
    </div>
  );
}

/** Bio, tags, counts with Follow, then links — the part under the photo in most layouts. */
function Body({
  data,
  links,
  loading,
  follow,
}: {
  data: ProfileCardData;
  links: ProfileLink[];
  loading: boolean;
  follow: Follow;
}) {
  return (
    <>
      {data.bio && <p className="line-clamp-3 text-sm leading-relaxed text-foreground/70">{data.bio}</p>}
      {data.tags.length > 0 && <Tags tags={data.tags} />}
      <Counts data={data} follow={follow} />
      {!loading && <Links links={links} />}
    </>
  );
}

/** Followers and posts with their icons, and Follow at the end on someone else's card. */
function Counts({ data, follow, centred = false }: { data: ProfileCardData; follow: Follow; centred?: boolean }) {
  return (
    <div className={`flex w-full items-center gap-4 text-sm ${centred && !follow ? "justify-center" : ""}`}>
      <span className="flex items-center gap-1.5" aria-label={`${data.stats.followers} followers`}>
        <Users size={15} className="text-foreground/50" aria-hidden />
        <b className="font-extrabold tabular-nums">{data.stats.followers.toLocaleString()}</b>
      </span>
      <span className="flex items-center gap-1.5" aria-label={`${data.stats.posts} posts`}>
        <LayoutGrid size={15} className="text-foreground/50" aria-hidden />
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

function BigCount({ n, label }: { n: number; label: string }) {
  return (
    <span className="flex flex-1 flex-col items-center">
      <b className="text-[17px] font-extrabold tabular-nums">{n.toLocaleString()}</b>
      <span className="text-[11px] text-foreground/55">{label}</span>
    </span>
  );
}

function Tags({ tags, centred = false }: { tags: string[]; centred?: boolean }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${centred ? "justify-center" : ""}`}>
      {tags.map((t) => (
        <span
          key={t}
          className="rounded-pill border border-white/15 bg-black/25 px-2.5 py-1 text-[11px] font-semibold text-foreground/85"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

/** Link buttons — the reason the card exists rather than the header. */
function Links({ links }: { links: ProfileLink[] }): ReactNode {
  if (links.length === 0) return null;
  return (
    <div className="mt-1 flex w-full flex-col gap-2">
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
            <span className="text-sm font-bold text-foreground">{l.label}</span>
            <span className="mt-0.5 truncate text-[10px] text-foreground/50">{prettyUrl(href)}</span>
          </a>
        );
      })}
    </div>
  );
}

/** A small QR for the pass, drawn in the browser like the full-size one. */
function useQr(url: string): string | null {
  const [qr, setQr] = useState<{ url: string; data: string } | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 240, color: { dark: "#0a0a0a", light: "#ffffff" } })
      .then((data) => {
        if (alive) setQr({ url, data });
      })
      .catch(() => {
        /* no QR: the address beside it still says where to go */
      });
    return () => {
      alive = false;
    };
  }, [url]);
  return qr?.url === url ? qr.data : null;
}
