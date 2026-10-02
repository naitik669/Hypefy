"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Star, Bookmark, MoreHorizontal } from "lucide-react";
import { ShareIcon } from "@/components/ui/ShareIcon";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import { HypeParticles } from "@/components/feed/HypeParticles";
import { HypeBreak } from "@/components/feed/HypeBreak";
import { formatCount } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { ShareButton } from "@/components/feed/QuickShare";
import { CommentIcon } from "@/components/ui/CommentIcon";
import { RehypeCount, RehypeIcon } from "@/components/ui/RehypeIcon";

/**
 * Hold a post or a Shot to lift it out of wherever it is: the feed, a grid,
 * a chat.
 *
 * Just the thing itself and what you can do with it. There is no author, no
 * caption and no card behind it any more: the post was already on screen with
 * all of that a moment ago, and repeating it around the photo made the peek
 * a smaller copy of the card you held rather than a closer look at the photo.
 * Under it, the five actions spread evenly across the width with their counts.
 *
 * It STAYS once opened. The hold opens it and a tap outside (or back, or
 * Escape) closes it, so it can be read without a thumb parked on the screen.
 */

/**
 * How long to ignore taps after opening. Comfortably past the synthetic
 * click browsers emit after a touch release (~300ms), so the release that
 * opened the peek cannot also close it.
 */
const ARM_MS = 420;

/** The tallest the media may be, so the row under it always fits. */
const PEEK_MAX_H = "58vh";

/**
 * The box the media sits in: exactly its own shape.
 *
 * The height cap alone would letterbox a tall post — full width, 58vh high,
 * black bars either side — so the same cap is applied to the width through the
 * ratio. Giving the box a size before the pixels arrive is also what stops the
 * peek growing mid-open.
 */
export function peekPhotoBox(ratio: number | null | undefined): {
  aspectRatio: string;
  maxHeight: string;
  maxWidth: string;
} {
  const r = ratio && ratio > 0 ? ratio : 1;
  return { aspectRatio: String(r), maxHeight: PEEK_MAX_H, maxWidth: `calc(${PEEK_MAX_H} * ${r})` };
}

/** The widest the peek may be, so a tall photo brings the row in with it. */
const PEEK_MAX_W = "440px";

export function peekCardBox(ratio: number | null | undefined): { maxWidth: string } {
  const r = ratio && ratio > 0 ? ratio : 1;
  return { maxWidth: `min(${PEEK_MAX_W}, calc(${PEEK_MAX_H} * ${r}))` };
}

/** Who posted it. Kept for the callers that still carry it; the peek no longer draws it. */
export type PeekAuthor = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  hue: number;
  verified: boolean;
  cosmetics?: {
    is_premium?: boolean | null;
    name_font?: string | null;
    name_glow?: string | null;
    avatar_decoration?: string | null;
  } | null;
};

export function PostPeek({
  src,
  videoSrc,
  aspectRatio,
  postId,
  targetType = "post",
  caption,
  hyped,
  hypeCount,
  commentCount,
  saved,
  rehyped,
  rehypeCount = 0,
  onRehype,
  onHype,
  onComment,
  onShare,
  onSave,
  onMore,
  onClose,
}: {
  src: string;
  /**
   * A Shot's video. With one, the peek PLAYS rather than holding a still —
   * \`src\` becomes the poster it starts from.
   */
  videoSrc?: string;
  /** The post's composed shape, so the box is right from the first frame. */
  aspectRatio?: number | null;
  /** What's being shared when the share button is held. */
  postId: string;
  targetType?: "post" | "shot";
  /** Not drawn; read out as the photo's description. */
  caption?: string | null;
  /** Kept so callers need not change; the peek no longer shows who posted. */
  author?: PeekAuthor | null;
  currentUserId?: string;
  hyped: boolean;
  hypeCount: number;
  commentCount: number;
  saved: boolean;
  /** Rehype, where the caller has it. No floating faces here: those belong on the card. */
  rehyped?: boolean;
  rehypeCount?: number;
  onRehype?: () => void;
  onHype: () => void;
  onComment: () => void;
  onShare: () => void;
  onSave: () => void;
  /**
   * A sixth item, only in a chat: holding a shared post there used to open
   * the message's own menu (reply, react, forward, unsend), and now opens
   * this instead — so the menu has to stay one tap away.
   */
  onMore?: () => void;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [armed, setArmed] = useState(false);
  /** Replays the burst on the icon that was just turned on. */
  const [hypeBurst, setHypeBurst] = useState(0);
  const [saveBurst, setSaveBurst] = useState(0);
  const [rehypePulse, setRehypePulse] = useState(0);
  /** Taking a hype back snaps the star in two, as on the feed. */
  const [broke, setBroke] = useState(false);
  useEffect(() => {
    if (!broke) return;
    const id = setTimeout(() => setBroke(false), 520);
    return () => clearTimeout(id);
  }, [broke]);
  const root = useRef<HTMLDivElement>(null);
  /** The big star over the media on a double-tap, replayed each time. */
  const [burst, setBurst] = useState(0);
  const lastTap = useRef({ at: 0, x: 0, y: 0 });

  // Nothing behind the peek moves while it's open. The hold that opened it
  // began on the post underneath, and touches stay with the element they
  // started on, so without this the same finger kept scrolling the page.
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

  // One frame at the small size, then grow, so the entrance actually plays.
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

  if (typeof document === "undefined") return null;

  /** Stops a tap inside the peek from reaching the dismissing backdrop. */
  const swallow = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div
      ref={root}
      // Under the comment and share sheets (z-200), so they open over the
      // peek instead of the peek closing first; above everything else.
      className="fixed inset-0 z-[190] flex touch-none items-center justify-center overscroll-none p-3"
      // Ignored until the opening gesture is over: the hold's own release
      // lands here, as a touchend and then a synthetic click.
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
      aria-label={targetType === "shot" ? "Shot preview" : "Post preview"}
    >
      <div
        className="flex w-full flex-col items-stretch gap-3"
        style={{
          ...peekCardBox(aspectRatio),
          transform: shown ? "scale(1)" : "scale(0.92)",
          opacity: shown ? 1 : 0,
          transition: "transform 200ms cubic-bezier(0.16,1,0.3,1), opacity 140ms ease-out",
        }}
      >
        {/* The media, whole. Double-tap hypes it, as on the feed. */}
        <div
          className="relative select-none"
          onClick={(e) => {
            swallow(e);
            const now = Date.now();
            const last = lastTap.current;
            if (now - last.at < 300 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 40) {
              lastTap.current = { at: 0, x: 0, y: 0 };
              haptics.success();
              setBurst((n) => n + 1);
              if (!hyped) onHype();
              return;
            }
            lastTap.current = { at: now, x: e.clientX, y: e.clientY };
          }}
        >
          <div
            className="relative mx-auto w-full overflow-hidden rounded-[20px] bg-black"
            style={peekPhotoBox(aspectRatio)}
          >
            {videoSrc ? (
              // Muted: the card underneath may still own the sound, and two
              // copies of the same Shot out of sync is worse than a silent one.
              <video
                src={videoSrc}
                poster={src || undefined}
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <OptimizedImage
                src={src}
                alt={caption ?? "Post"}
                sizes="(max-width: 480px) 100vw, 440px"
                className="object-cover"
                draggable={false}
              />
            )}
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

        {/* Every action spread evenly across the width, counts beside them. */}
        <div className="flex items-center justify-between px-2.5" onClick={swallow}>
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
                size={24}
                strokeWidth={2.2}
                className={`${broke ? "animate-hype-crack" : hypeBurst ? "animate-hype-burst" : ""} transition-colors ${hyped ? "text-hype" : ""}`}
                fill={hyped ? "currentColor" : "none"}
              />
              {hyped && hypeBurst > 0 && !broke && <HypeParticles key={hypeBurst} size={9} />}
              {broke && <HypeBreak size={24} />}
            </span>
          </PeekAction>

          <PeekAction label="Comments" count={commentCount} onClick={onComment}>
            <CommentIcon size={23} strokeWidth={2.2} />
          </PeekAction>

          <ShareButton
            postId={postId}
            targetType={targetType}
            onOpenSheet={onShare}
            className="flex items-center gap-1.5 text-white transition-transform duration-150 active:scale-90"
          >
            <ShareIcon size={22} weight="bold" />
          </ShareButton>

          {onRehype && (
            <PeekAction
              label={rehyped ? "Rehyped. Tap to undo" : "Rehype"}
              active={!!rehyped}
              onClick={() => {
                setRehypePulse((n) => n + 1);
                onRehype();
              }}
            >
              <RehypeIcon size={24} active={!!rehyped} pulse={rehypePulse} />
              {rehypeCount > 0 && (
                <RehypeCount value={formatCount(rehypeCount)} pulse={rehypePulse} active={!!rehyped} />
              )}
            </PeekAction>
          )}

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
              size={22}
              strokeWidth={2.2}
              className={`${saveBurst ? "animate-hype-burst" : ""} transition-colors`}
              fill={saved ? "currentColor" : "none"}
            />
          </PeekAction>

          {onMore && (
            <PeekAction label="More" onClick={onMore}>
              <MoreHorizontal size={23} strokeWidth={2.2} />
            </PeekAction>
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
  /** Hype is yellow, saving and rehyping are lime — the count follows its icon. */
  activeClass?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      // White, not the theme's foreground: this sits on the dimmed screen,
      // which is dark whatever the theme is.
      className={`flex items-center gap-1.5 text-sm font-bold tabular-nums transition-transform duration-150 active:scale-90 ${
        active ? activeClass : "text-white"
      }`}
    >
      {children}
      {count !== undefined && count > 0 && <span>{formatCount(count)}</span>}
    </button>
  );
}
