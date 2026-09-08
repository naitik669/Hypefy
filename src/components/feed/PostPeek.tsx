"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Heart, MessageCircle, Send, Bookmark } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { FollowButton } from "@/components/profile/FollowButton";
import { formatCount } from "@/lib/format";

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

export type PeekAuthor = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  hue: number;
  verified: boolean;
};

export function PostPeek({
  src,
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
      className="fixed inset-0 z-[300] flex items-center justify-center p-3"
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
          // Rises from just under its resting size, which reads as the card
          // lifting rather than a new thing appearing.
          transform: shown ? "scale(1)" : "scale(0.92)",
          opacity: shown ? 1 : 0,
          transition:
            "transform 200ms cubic-bezier(0.16,1,0.3,1), opacity 140ms ease-out",
        }}
      >
        {/* Author. The one thing the old peek could not tell you. */}
        {author && (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5">
            <Avatar
              name={author.name}
              hue={author.hue}
              size={34}
              src={author.avatarUrl ?? undefined}
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate text-sm font-semibold">
                {author.name}
                {author.verified && (
                  <VerifiedStar className="h-3.5 w-3.5 shrink-0 text-verified" />
                )}
              </p>
              {author.username && (
                <p className="truncate text-xs text-muted">@{author.username}</p>
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

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          /* object-contain is the real gain, not raw size. A feed card crops
             to its composed aspect ratio with object-cover, so a wide or tall
             post is showing you part of itself; this shows all of it. */
          className="max-h-[58vh] w-full bg-black object-contain"
        />

        <div className="flex flex-col gap-2 px-3.5 pb-3 pt-2.5">
          {/* Same actions as the feed row, in the same order, so the hold
              does not become a second grammar to learn. */}
          <div className="flex items-center gap-1">
            <PeekAction
              label={hyped ? "Remove hype" : "Hype"}
              count={hypeCount}
              active={hyped}
              onClick={() => {
                onHype();
              }}
            >
              <Heart
                size={22}
                className={hyped ? "fill-accent text-accent" : ""}
              />
            </PeekAction>

            <PeekAction
              label="Comments"
              count={commentCount}
              onClick={() => {
                onClose();
                onComment();
              }}
            >
              <MessageCircle size={22} />
            </PeekAction>

            <PeekAction
              label="Share"
              onClick={() => {
                onClose();
                onShare();
              }}
            >
              <Send size={21} />
            </PeekAction>

            <div className="flex-1" />

            <PeekAction
              label={saved ? "Remove from saved" : "Save"}
              active={saved}
              onClick={onSave}
            >
              <Bookmark
                size={21}
                className={saved ? "fill-accent text-accent" : ""}
              />
            </PeekAction>
          </div>

          {caption && (
            <p className="line-clamp-3 text-sm leading-relaxed text-foreground/90">
              {caption}
            </p>
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
  onClick,
  children,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-10 items-center gap-1.5 rounded-full px-2 transition-colors active:scale-95 ${
        active ? "text-accent" : "text-foreground hover:bg-white/5"
      }`}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="text-xs font-semibold tabular-nums">
          {formatCount(count)}
        </span>
      )}
    </button>
  );
}
