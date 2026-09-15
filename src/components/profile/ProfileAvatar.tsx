"use client";

import { useEffect, useRef, useState } from "react";
import { onSeenShowsChange, readSeenShows } from "@/lib/seen-shows";
import { useRouter } from "next/navigation";
import { AvatarImg } from "@/components/ui/AvatarImg";
import { AvatarFrame } from "@/components/ui/AvatarFrame";
import { ProfileCard, type ProfileCardData } from "@/components/profile/ProfileCard";

const LONG_PRESS_MS = 450;

/**
 * Profile avatar with story-ring + gesture handling:
 *  - tap, active Show  → opens the Show (with accent ring shown)
 *  - tap, no Show       → opens the profile card
 *  - press & hold       → always opens the profile card
 *
 * Expanding used to show the raw photo. It now shows the card — identity,
 * links and a QR — with the photo one tap further in, since the card is
 * the thing worth sharing and the photo rarely was.
 */
export function ProfileAvatar({
  name,
  hue,
  avatarUrl,
  size = 84,
  hasActiveShow = false,
  showId,
  card,
  decoration = null,
  showSeen = false,
}: {
  name: string;
  hue: number;
  avatarUrl: string | null | undefined;
  size?: number;
  hasActiveShow?: boolean;
  showId?: string | null;
  /** Omitted on surfaces with no profile context; expanding is then a no-op. */
  card?: ProfileCardData;
  /** A decoration the owner can wear right now (see visibleDecoration). */
  decoration?: string | null;
  /** The viewer has already watched this Show (from show_views). */
  showSeen?: boolean;
}) {
  const router = useRouter();
  const [cardOpen, setCardOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  // Green ring only until you've watched it — the same record Home uses.
  const [seenHere, setSeenHere] = useState(false);
  useEffect(() => {
    if (!showId) return;
    const sync = () => setSeenHere(readSeenShows().has(showId));
    sync();
    return onSeenShowsChange(sync);
  }, [showId]);
  const ringOn = hasActiveShow && !showSeen && !seenHere;

  // Gated on the card, not the photo: a profile with no avatar still has
  // a name, links and a QR worth opening.
  const canExpand = !!card;

  function expand() {
    if (canExpand) setCardOpen(true);
  }

  function onPointerDown() {
    didLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      expand(); // hold → always expand the photo
    }, LONG_PRESS_MS);
  }

  function clearTimer() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function onPointerUp() {
    clearTimer();
    if (didLongPress.current) return; // handled by long-press
    // Short tap
    if (hasActiveShow && showId) {
      router.push(`/shows/${showId}`);
    } else {
      expand();
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={hasActiveShow ? `Watch ${name}'s Show` : `Open ${name}'s profile card`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={clearTimer}
        onPointerCancel={clearTimer}
        onContextMenu={(e) => e.preventDefault()}
        className="block touch-none select-none active:scale-[0.98]"
      >
        <AvatarFrame id={decoration} size={hasActiveShow ? size + 12 : size}>
        {hasActiveShow ? (
          // Story ring: green until watched, then grey
          <div className={`rounded-[30px] p-[3px] ${ringOn ? "bg-accent" : "bg-[#3a3a3a]"}`}>
            <div className="rounded-[27px] bg-background p-[3px]">
              <AvatarImg url={avatarUrl} name={name} hue={hue} size={size} className="rounded-[22px]" />
            </div>
          </div>
        ) : (
          <AvatarImg url={avatarUrl} name={name} hue={hue} size={size} className="rounded-[26px] ring-4 ring-background" />
        )}
        </AvatarFrame>
      </button>

      {cardOpen && card && (
        <ProfileCard data={card} onClose={() => setCardOpen(false)} />
      )}
    </>
  );
}
