"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Star, MessageCircle, Bookmark } from "lucide-react";
import { ShareIcon } from "@/components/ui/ShareIcon";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { createClient } from "@/lib/supabase/client";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarFrame } from "@/components/ui/AvatarFrame";
import { DisplayName } from "@/components/ui/DisplayName";
import { HypeParticles } from "@/components/feed/HypeParticles";
import { HypeBreak } from "@/components/feed/HypeBreak";
import { visibleDecoration } from "@/lib/cosmetics";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { FollowButton } from "@/components/profile/FollowButton";
import { formatCount } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { ShareButton } from "@/components/feed/QuickShare";

/**
 * Hold a photo to lift the whole POST off the feed.
 *
 * Deliberately not the full-screen viewer, and no longer a bare image either.
 * It used to show the picture alone, which answered "what is that?" and
 * nothing else — you could see the photo but not who posted it, and the only
 * way to act on it was to dismiss the peek and find the card again. It is a
 * card now: author, caption, and the same actions the feed row carries, so a
 * hold is a place you can finish something rather than a detour.
 *
 * It STAYS once opened. It used to close on release, which meant reading it
 * with your thumb parked on the screen and losing it the moment you moved.
 * Now the hold opens it and a tap on the backdrop (or back, or Escape) closes.
 */

/**
 * How long to ignore taps after opening. Comfortably past the synthetic
 * click browsers emit after a touch release (~300ms), so the release that
 * opened the peek cannot also close it.
 */
const ARM_MS = 420;

/** The tallest the photo may be, so the card's own chrome always fits. */
const PEEK_MAX_H = "58vh";

/**
 * The box the photo sits in: exactly its own shape.
 *
 * The height cap alone would letterbox a tall post — full width, 58vh high,
 * black bars either side — so the same cap is applied to the width through the
 * ratio. A 9:16 post then comes out narrower rather than padded, and every
 * post is drawn at its true shape. Giving the box a size before the pixels
 * arrive is also what stops the card growing mid-open.
 */
export function peekPhotoBox(ratio: number | null | undefined): {
  aspectRatio: string;
  maxHeight: string;
  maxWidth: string;
} {
  const r = ratio && ratio > 0 ? ratio : 1;
  return { aspectRatio: String(r), maxHeight: PEEK_MAX_H, maxWidth: `calc(${PEEK_MAX_H} * ${r})` };
}

/** The widest the card may be, so a tall photo takes the card in with it
 *  instead of sitting in a strip of empty surface. */
const PEEK_MAX_W = "440px";

export function peekCardBox(ratio: number | null | undefined): { maxWidth: string } {
  const r = ratio && ratio > 0 ? ratio : 1;
  return { maxWidth: `min(${PEEK_MAX_W}, calc(${PEEK_MAX_H} * ${r}))` };
}

export type PeekAuthor = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  hue: number;
  verified: boolean;
  /** Their frame and name style, drawn in the peek as on the card. */
  cosmetics?: {
    is_premium?: boolean | null;
    name_font?: string | null;
    name_glow?: string | null;
    avatar_decoration?: string | null;
  } | null;
};

export function PostPeek({
  src,
  aspectRatio,
  postId,
  targetType = "post",
  author,
  caption,
  currentUserId,
  hyped,
  hypeCount,
  commentCount,
  saved,
  onHype,
  onComment,
  onShare,
  onSave,
  onClose,
}: {
  src: string;
  /** The post's composed shape (posts.aspect_ratio), so the box is right from
   *  the first frame. Null falls back to a square, as the feed card does. */
  aspectRatio?: number | null;
  /** What's being shared when the share button is held. */
  postId: string;
  targetType?: "post" | "shot";
  author: PeekAuthor | null;
  caption: string | null;
  currentUserId: string;
  hyped: boolean;
  hypeCount: number;
  commentCount: number;
  saved: boolean;
  onHype: () => void;
  onComment: () => void;
  onShare: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [armed, setArmed] = useState(false);
  /** null until resolved; undefined author or own post never resolves. */
  const [following, setFollowing] = useState<boolean | null>(null);

  const isOwn = !!author && author.id === currentUserId;
  /** Replays the burst on the icon that was just turned on. */
  const [hypeBurst, setHypeBurst] = useState(0);
  const [saveBurst, setSaveBurst] = useState(0);
  /** Taking a hype back snaps the star in two, as on the feed. */
  const [broke, setBroke] = useState(false);
  useEffect(() => {
    if (!broke) return;
    const id = setTimeout(() => setBroke(false), 520);
    return () => clearTimeout(id);
  }, [broke]);
  const root = useRef<HTMLDivElement>(null);
  /** The big star over the photo on a double-tap, replayed each time. */
  const [burst, setBurst] = useState(0);
  const lastTap = useRef({ at: 0, x: 0, y: 0 });
  function bigStar() {
    haptics.success();
    setBurst((n) => n + 1);
  }

  // Nothing behind the peek moves while it's open. The hold that opened it
  // began on the post underneath, and touches stay with the element they
  // started on, so without this the same finger kept scrolling and swiping
  // the feed behind the card.
  useEffect(() => {
    const html = document.documentElement;
    const prevHtml = html.style.overflow;
    const prevBody = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const block = (e: Event) => {
      // A sheet opened over the peek (comments, share) scrolls normally.
      const el = e.target instanceof Element ? e.target.closest('[role="dialog"]') : null;
      if (el && el !== root.current) return;
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener("touchmove", block, { passive: false });
    document.addEventListener("wheel", block, { passive: false });
    return () => {
      html.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
      document.removeEventListener("touchmove", block);
      document.removeEventListener("wheel", block);
    };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setArmed(true), ARM_MS);
    return () => clearTimeout(id);
  }, []);

  // Registering with the overlay stack keeps the tab-swipe and the reel
  // underneath from treating the same touch as theirs.
  useOverlayBackButton(true, onClose);

  // One frame at the small size, then grow. Mounting straight into the final
  // transform would skip the transition entirely and it would just appear.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Follow state is resolved HERE rather than on every card in the feed.
  // FollowButton needs to know, and a hold is a deliberate, infrequent
  // gesture — one query for the post you actually stopped on beats one per
  // card for the hundred you scrolled past.
  useEffect(() => {
    if (!author || isOwn) return;
    let live = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", currentUserId)
        .eq("following_id", author.id)
        .maybeSingle();
      if (live) setFollowing(!!data);
    })();
    return () => {
      live = false;
    };
  }, [author, isOwn, currentUserId]);

  if (typeof document === "undefined") return null;

  /** Stops a tap inside the card from reaching the dismissing backdrop. */
  const swallow = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div
      /* p-3, not p-6. The card is only mx-4 from the screen edge, so with
         24px of padding here the "expanded" post came out NARROWER than the
         one it expanded from — measured at 342px against the card's 358 on a
         390px screen. A peek that shrinks the post is worse than no peek. */
      // Under the comment and share sheets (z-200), so they open over the
      // peek instead of the peek closing first; above everything else.
      ref={root}
      className="fixed inset-0 z-[190] flex touch-none items-center justify-center overscroll-none p-3"
      // Ignored until the opening gesture is over. The hold that opens this
      // is still in progress, and its release lands here — as a touchend,
      // and then as the synthetic click browsers fire a moment later on
      // whatever is under the finger. Without the guard the peek closed
      // itself on the very gesture that opened it.
      onClick={() => {
        if (armed) onClose();
      }}
      onTouchEnd={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      style={{
        background: `rgba(0,0,0,${shown ? 0.72 : 0})`,
        transition: "background 180ms ease-out",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Post preview"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-[440px] flex-col overflow-hidden rounded-3xl bg-surface shadow-2xl ring-1 ring-white/10"
        onClick={swallow}
        style={{
          ...peekCardBox(aspectRatio),
          // Rises from just under its resting size, which reads as the card
          // lifting rather than a new thing appearing.
          transform: shown ? "scale(1)" : "scale(0.92)",
          opacity: shown ? 1 : 0,
          transition:
            "transform 200ms cubic-bezier(0.16,1,0.3,1), opacity 140ms ease-out",
        }}
      >
        {/* Author */}
        {author && (
          <div className="flex items-center gap-3 px-4 pb-3 pt-3.5">
            <AvatarFrame id={author.cosmetics ? visibleDecoration(author.cosmetics) : null} size={38}>
              <Avatar
                name={author.name}
                hue={author.hue}
                size={38}
                src={author.avatarUrl ?? undefined}
              />
            </AvatarFrame>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="flex min-w-0 items-center gap-1 text-[15px] font-semibold">
                <DisplayName name={author.name} profile={author.cosmetics} className="truncate" />
                {author.verified && (
                  <VerifiedBadge className="h-3.5 w-3.5 shrink-0" />
                )}
              </p>
              {author.username && (
                <p className="mt-0.5 truncate text-xs text-muted">@{author.username}</p>
              )}
            </div>
            {/* Only once resolved, and never on your own post — a button that
                flickers from "Follow" to "Following" is worse than a beat of
                nothing. */}
            {!isOwn && following !== null && (
              <FollowButton
                targetUserId={author.id}
                initialFollowing={following}
                variant="inline"
              />
            )}
          </div>
        )}

        {/* The photo, whole. Double-tap hypes it, as on the feed. */}
        <div
          className="relative select-none bg-black"
          onClick={(e) => {
            const now = Date.now();
            const last = lastTap.current;
            if (now - last.at < 300 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 40) {
              lastTap.current = { at: 0, x: 0, y: 0 };
              bigStar();
              if (!hyped) onHype();
              return;
            }
            lastTap.current = { at: now, x: e.clientX, y: e.clientY };
          }}
        >
          {/* The box is the photo's own shape (see peekPhotoBox), so
              object-cover crops nothing — you see the whole post, at the size
              it will still be once the pixels land. */}
          <div className="relative mx-auto w-full overflow-hidden" style={peekPhotoBox(aspectRatio)}>
            <OptimizedImage
              src={src}
              alt={caption ?? "Post"}
              sizes="(max-width: 480px) 100vw, 440px"
              className="object-cover"
              draggable={false}
            />
          </div>
          {burst > 0 && (
            <div key={burst} className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Star
                size={96}
                className="animate-hype-pop text-hype drop-shadow-[0_4px_20px_rgba(255,208,0,0.5)]"
                fill="currentColor"
              />
              <span className="absolute">
                <HypeParticles size={16} />
              </span>
            </div>
          )}
        </div>

        {/* Same actions as the feed row, in the same order and spacing. */}
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="flex items-center gap-5">
            <PeekAction
              label={hyped ? "Remove hype" : "Hype"}
              count={hypeCount}
              active={hyped}
              activeClass="text-hype"
              onClick={() => {
                if (hyped) setBroke(true);
                else setHypeBurst((n) => n + 1);
                onHype();
              }}
            >
              <span className="relative">
                <Star
                  key={hypeBurst}
                  size={23}
                  strokeWidth={2.2}
                  className={`${broke ? "animate-hype-crack" : hypeBurst ? "animate-hype-burst" : ""} transition-colors ${hyped ? "text-hype" : ""}`}
                  fill={hyped ? "currentColor" : "none"}
                />
                {hyped && hypeBurst > 0 && !broke && <HypeParticles key={hypeBurst} size={9} />}
                {broke && <HypeBreak size={23} />}
              </span>
            </PeekAction>

            <PeekAction label="Comments" count={commentCount} onClick={onComment}>
              <MessageCircle size={22} strokeWidth={2.2} />
            </PeekAction>

            <ShareButton
              postId={postId}
              targetType={targetType}
              onOpenSheet={onShare}
              className="flex items-center gap-1.5 text-sm font-semibold text-foreground transition-transform duration-150 active:scale-90"
            >
              <ShareIcon size={21} weight="bold" />
            </ShareButton>
          </div>

          <PeekAction
            label={saved ? "Remove from saved" : "Save"}
            active={saved}
            onClick={() => {
              if (!saved) setSaveBurst((n) => n + 1);
              onSave();
            }}
          >
            <Bookmark
              key={saveBurst}
              size={21}
              strokeWidth={2.2}
              className={`${saveBurst ? "animate-hype-burst" : ""} transition-colors`}
              fill={saved ? "currentColor" : "none"}
            />
          </PeekAction>
        </div>

        <div className="px-4 pb-4 pt-2">
          {caption ? (
            <p className="line-clamp-3 text-sm leading-relaxed text-foreground/90">
              {author?.username && <span className="mr-1.5 font-semibold text-foreground">{author.username}</span>}
              {caption}
            </p>
          ) : (
            <p className="text-xs text-faint">Double-tap to hype · tap outside to close</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PeekAction({
  label,
  count,
  active = false,
  activeClass = "text-accent",
  onClick,
  children,
}: {
  label: string;
  count?: number;
  active?: boolean;
  /** Hype is yellow, saving is green — the count has to follow its own icon. */
  activeClass?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex items-center gap-1.5 text-sm font-semibold tabular-nums transition-transform duration-150 active:scale-90 ${
        active ? activeClass : "text-foreground"
      }`}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span>
          {formatCount(count)}
        </span>
      )}
    </button>
  );
}
